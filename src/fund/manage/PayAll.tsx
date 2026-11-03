// "Pay all interest due": payDue sweeps from min(blockedFrom, payCursor),
// oldest deposit first, and records nextDue once a sweep reaches the last
// deposit. Payments are up to date while nextDue is in the future. The button
// sends batches until then (one transaction for most projects), and stops at
// the first deposit the interest reserve and net earnings can't cover.
// payDue needs no role, so any wallet can send it.
import { useState } from 'react';
import { BaseError, ContractFunctionRevertedError, multicall3Abi } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi } from '../abi';
import { NONE, formatTime } from '../format';
import { cyclesOwed } from '../positions';
import { useSend } from '../tx';
import { plural, type Tone } from '../ui';
import type { ProjectView } from './fields';

/** Deposits per payDue, halved while the gas estimate fails or is too big for a block. */
const BATCH = 100n;
const GAS_CAP = 30_000_000n;
/** A runaway guard: more rounds than this means something else is wrong. */
const MAX_ROUNDS = 10;

/** Interest due now across every deposit, and how much the reserve and earnings can't cover. */
export function interestDue(v: ProjectView) {
  let due = 0n;
  let count = 0;
  for (const d of v.deposits) {
    const owed = cyclesOwed(d, v.cycleDuration, v.now);
    if (owed > 0n) {
      due += owed * ((d.principal * d.rate) / 100_000_000n);
      count++;
    }
  }
  const available = v.data.state.interestReserve + v.data.state.netEarnings;
  return { due, count, shortfall: due > available ? due - available : 0n };
}

export function PayAll({ v }: { v: ProjectView }) {
  const client = usePublicClient()!;
  const send = useSend();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null);
  const { due, count, shortfall } = interestDue(v);
  const project = v.listing.project;

  async function read() {
    const [payCursor, blockedFrom, nextDue, depositCount, time] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: project, abi: projectAbi, functionName: 'payCursor' },
        { address: project, abi: projectAbi, functionName: 'blockedFrom' },
        { address: project, abi: projectAbi, functionName: 'nextDue' },
        { address: project, abi: projectAbi, functionName: 'depositCount' },
        { address: client.chain!.contracts!.multicall3!.address, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' },
      ],
    });
    return { payCursor, blockedFrom, nextDue, depositCount, time };
  }

  /** The biggest batch whose gas estimate fits in a block. */
  async function fit(from: bigint, batch: bigint) {
    for (;;) {
      try {
        const gas = await client.estimateContractGas({ address: project, abi: projectAbi, functionName: 'payDue', args: [from, batch], account: v.account });
        if (gas <= GAS_CAP || batch === 1n) return batch;
      } catch (e) {
        // A real refusal: let send() explain it.
        if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) return batch;
        if (batch === 1n) return batch;
      }
      batch /= 2n;
    }
  }

  async function payAll() {
    setBusy(true);
    setNote(null);
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const s = await read();
        if (s.blockedFrom === NONE && s.nextDue > s.time) {
          setNote({ tone: 'ok', text: round === 1 ? 'Payments are already up to date.' : 'Payments are up to date.' });
          return;
        }
        const from = s.blockedFrom < s.payCursor ? s.blockedFrom : s.payCursor;
        const left = s.depositCount - from;
        const batch = await fit(from, left < BATCH ? left : BATCH);
        const receipt = await send(
          round === 1 ? 'Pay all interest due' : `Pay all interest due (part ${round})`,
          { address: project, abi: projectAbi, functionName: 'payDue', args: [from, batch] },
          { project, amount: (x) => v.amount(BigInt(x as bigint)) },
        );
        if (!receipt) {
          setNote({ tone: 'neutral', text: 'Once your Safe has sent it, come back and pay again if anything is still due.' });
          return;
        }
        const after = await read();
        if (after.blockedFrom !== NONE) {
          setNote({
            tone: 'bad',
            text: `Payments stopped at deposit #${after.blockedFrom}: the interest reserve and earnings can't cover it. Add money to the project, then pay again.`,
          });
          return;
        }
      }
      setNote({ tone: 'warn', text: 'Still not up to date after several transactions. Reload the page and try again.' });
    } catch {
      // The toast says why.
    } finally {
      setBusy(false);
    }
  }

  const upToDate = v.data.state.blockedFrom === NONE && v.data.nextDue > v.now;
  return (
    <div className="fm-payall">
      {upToDate ? (
        <p className="fp-ok">
          Payments are up to date.{v.data.nextDue !== NONE && ` Next due ${formatTime(v.data.nextDue, v.withTime)}.`}
        </p>
      ) : (
        <p>
          <strong>{v.amount(due)}</strong> due now across {plural(count, 'deposit')}.
          {shortfall > 0n && (
            <span className="fp-bad">
              {' '}
              The interest reserve and earnings are {v.amount(shortfall)} short, so payments will stop at the first deposit they can't cover.
            </span>
          )}
        </p>
      )}
      {!upToDate && (
        <button type="button" className="fp-btn" disabled={busy} onClick={payAll}>
          {busy ? 'Paying…' : 'Pay all interest due'}
        </button>
      )}
      {/* A "stopped" note goes once money has come in to cover it. */}
      {note && !(note.tone === 'bad' && shortfall === 0n) && <p className={`fp-${note.tone}`}>{note.text}</p>}
    </div>
  );
}

/** A recurring calendar reminder to pay interest, made in the browser (no backend to send one). */
export function ReminderButton({ v }: { v: ProjectView }) {
  function download() {
    const cycle = Number(v.cycleDuration);
    const [freq, interval] =
      cycle % 86400 === 0 ? ['DAILY', cycle / 86400] : cycle % 3600 === 0 ? ['HOURLY', cycle / 3600] : ['MINUTELY', Math.max(1, Math.round(cycle / 60))];
    const start = v.data.nextDue !== NONE && v.data.nextDue > v.now ? v.data.nextDue : v.now;
    const stamp = (t: bigint | number) => new Date(Number(t) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const url = `${location.origin}/manage/#${v.listing.project}/earnings`;
    const text = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Lemon Real Estate//Wallet pages//EN',
      'BEGIN:VEVENT',
      `UID:${v.listing.project}-${Date.now()}@${location.host}`,
      `DTSTAMP:${stamp(Date.now() / 1000)}`,
      `DTSTART:${stamp(start)}`,
      'DURATION:PT15M',
      `RRULE:FREQ=${freq};INTERVAL=${interval}`,
      `SUMMARY:${text(`Pay interest due: ${v.listing.title}`)}`,
      `DESCRIPTION:${text(`Open ${url} and click Pay all interest due.`)}`,
      `URL:${url}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'pay-interest-due.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <button type="button" className="fp-btn fp-btn-quiet" onClick={download}>
      Add a reminder to your calendar
    </button>
  );
}

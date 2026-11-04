// Surplus & development: splitting earnings, withdrawing development funds,
// and buying LEMX with the money set aside for it.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi } from '../abi';
import { parseAmount, plainAmount } from '../format';
import { feeFor } from './actions';
import { DO, H } from './help';
import { ActionButton, Addr, AmountInput, Badge, Bar, Callout, Card, ConfirmButton, Field, Kv, Kvs, Line, Stat, TipButton, checkAmount, duration, lowerFirst, relative } from './ui';
import { lemxMarket, swapSlices, useD, useV } from './view';

export function Surplus() {
  return (
    <div className="mg-stack">
      <Split />
      <div className="mg-grid-2">
        <DevFunds />
        <Compounding />
      </div>
    </div>
  );
}

function Blocked() {
  const v = useV();
  const d = useD();
  if (d.waiting)
    return (
      <Callout tone="bad" title={d.covered ? 'Waiting: an interest payment is ready to pay' : 'Waiting: an interest payment needs money'}>
        {d.covered ? 'Investors are paid before any surplus moves. Pay investors on the Earnings page first.' : 'Investors are paid before any surplus moves. Collect earnings or add money, then pay investors.'}
      </Callout>
    );
  if (!d.current && v.s.depositCount > 0n)
    return (
      <Callout tone="warn" title="Waiting until investors are paid">
        Pay investors on the Earnings page first. The contract refuses a split while any cycle is due.
      </Callout>
    );
  return null;
}

function Split() {
  const v = useV();
  const d = useD();
  const s = v.s;
  const net = s.netEarnings;
  const [repay, setRepay] = useState('');
  const [dev, setDev] = useState('');
  const [comp, setComp] = useState('');
  const vals = [repay, dev, comp].map((x) => parseAmount(x, v.token.decimals));
  const invalid = vals.some((x) => x === null);
  const total = vals.reduce<bigint>((t, x) => t + (x ?? 0n), 0n);
  const over = total > net;
  const ok = !invalid && total > 0n && !over && d.current && !d.waiting;
  const fill = (which: 0 | 1 | 2) => {
    const used = vals.reduce<bigint>((t, x, i) => (i === which ? t : t + (x ?? 0n)), 0n);
    const rest = net > used ? plainAmount(net - used, v.token.decimals) : '0';
    [setRepay, setDev, setComp][which](rest);
  };
  const after = { payoff: s.payoffPool + (vals[0] ?? 0n), dev: s.devBalance + (vals[1] ?? 0n), comp: s.compoundPending + (vals[2] ?? 0n), net: net - total };
  return (
    <Card title="Split earnings" help={H.split} subtitle="Share earnings between repaying investors early, development funds for the company, and buying LEMX.">
      <Blocked />
      <div className="mg-grid-split-rev">
        <div className="mg-stack">
          <Stat label="Earnings available" help="Earnings left after the reserves are full, ready to split." value={v.amount(net)} tone={net > 0n ? 'ok' : undefined} />
          <div className="mg-subpanel">
            <h3>After this split</h3>
            <Kvs>
              <Kv k="Repayment fund" v={v.amount(after.payoff)} />
              <Kv k="Development funds" v={v.amount(after.dev)} />
              <Kv k="Set aside for LEMX" v={v.amount(after.comp)} />
              <Kv k="Earnings left" v={<span className={over ? 'mg-text-bad' : undefined}>{over ? `−${v.amount(total - net)}` : v.amount(after.net)}</span>} />
            </Kvs>
          </div>
        </div>
        <div className="mg-form">
          <SplitRow label="Repay investors" hint={s.fullyRepaid ? 'Fully repaid: nothing left to repay.' : 'Goes to the repayment fund (repaid first in, first out).'} value={repay} onChange={setRepay} onFill={() => fill(0)} disabled={s.fullyRepaid} />
          <SplitRow label="Development funds" hint="Can be withdrawn to the company wallet." value={dev} onChange={setDev} onFill={() => fill(1)} />
          <SplitRow label="Buy LEMX" hint="Swapped to LEMX and locked in the pool." value={comp} onChange={setComp} onFill={() => fill(2)} />
          {over && <p className="mg-text-bad">The split is {v.amount(total - net)} more than the earnings available.</p>}
          {invalid && <p className="mg-text-bad">Enter amounts as numbers.</p>}
          <ActionButton
            title="Split earnings"
            tip={DO.split}
            need="MANAGER_ROLE"
            disabled={!ok}
            reason={!d.current || d.waiting ? 'Investors have to be current first.' : 'Enter amounts within the earnings available.'}
            run={async (ctx) => {
              await ctx.send('Split earnings', { functionName: 'split', args: vals.map((x) => x ?? 0n) });
              ctx.done(`Shared out ${v.amount(total)}.`);
            }}
            onDone={() => {
              setRepay('');
              setDev('');
              setComp('');
            }}
          >
            Split {total > 0n ? v.amount(total) : ''}
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

function SplitRow({ label, hint, value, onChange, onFill, disabled }: { label: string; hint: string; value: string; onChange: (s: string) => void; onFill: () => void; disabled?: boolean }) {
  return (
    <div className="mg-split-row">
      <Field label={label} hint={hint}>
        {(id, d) => <AmountInput id={id} describedBy={d} value={value} onChange={onChange} disabled={disabled} />}
      </Field>
      {!disabled && (
        <TipButton className="mg-link mg-small-text" tip={DO.useRest} onClick={onFill}>
          Use the rest<span className="mg-sr"> for {lowerFirst(label)}</span>
        </TipButton>
      )}
    </div>
  );
}

function DevFunds() {
  const v = useV();
  const d = useD();
  const s = v.s;
  const [amount, setAmount] = useState('');
  const [a, err] = checkAmount(v, amount, { max: s.devBalance, maxLabel: 'the development funds' });
  const block = d.waiting || (!d.current && s.depositCount > 0n) ? 'Investors have to be current first.' : s.mgmtFeeDeferred > 0n ? 'Deferred management fees have to be paid first.' : s.paused ? 'The project is paused.' : null;
  return (
    <Card title="Development funds" help={H.devFunds} subtitle="Company money set aside by splits.">
      <div className="mg-row-wrap">
        <Stat label="Available" help="Development funds that can be withdrawn now." value={v.amount(s.devBalance)} />
        <div className="mg-stat">
          <div className="mg-label">Paid to</div>
          <Addr a={v.ledger.wallets.companyWallet} />
          <div className="mg-stat-sub">The company wallet</div>
        </div>
      </div>
      {block && s.devBalance > 0n && <Callout tone="warn">{block}</Callout>}
      <Field label="Amount" error={err}>
        {(id, dd) => <AmountInput id={id} describedBy={dd} value={amount} onChange={setAmount} max={s.devBalance} />}
      </Field>
      <ActionButton
        title="Withdraw development funds"
        tip={DO.withdrawDev}
        need="MANAGER_ROLE"
        disabled={!a || !!block}
        reason={block ?? 'Enter an amount.'}
        run={async (ctx) => {
          await ctx.send('Withdraw development funds', { functionName: 'withdrawDev', args: [a!] });
          ctx.done(`Sent ${v.amount(a!)} to the company wallet.`);
        }}
        onDone={() => setAmount('')}
      >
        Withdraw
      </ActionButton>
    </Card>
  );
}

/** LEMX per one stable token, from an 18-decimal price. */
const perToken = (p18: bigint) => +Number(formatUnits(p18, 18)).toPrecision(6);

function useLemx() {
  const v = useV();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['fund-lemx', v.listing.project],
    staleTime: Infinity,
    queryFn: async () => {
      const lemx = await client!.readContract({ address: v.listing.project, abi: projectAbi, functionName: 'lemx' });
      const [decimals, symbol] = await Promise.all([client!.readContract({ address: lemx, abi: erc20Abi, functionName: 'decimals' }), client!.readContract({ address: lemx, abi: erc20Abi, functionName: 'symbol' })]);
      return { decimals, symbol };
    },
  });
}

function Compounding() {
  const v = useV();
  const d = useD();
  const lemx = useLemx().data ?? { decimals: 18, symbol: 'LEMX' };
  const s = v.s;
  const sw = v.u.swap;
  const slip = v.config.compoundSlippageBps;
  const fee = feeFor(v, 'deposit');
  // Purchases start slippage below the feed's market.
  const market18 = lemxMarket(v.u);
  const floor18 = (market18 * (10_000n - slip)) / 10_000n;
  const [newFloor, setNewFloor] = useState('');
  let nf: bigint | null = null;
  try {
    nf = newFloor.trim() ? parseUnits(newFloor.trim(), 18) : null;
  } catch {
    nf = null;
  }
  const nfErr = newFloor.trim() ? (nf === null ? 'Enter a number.' : nf >= v.ledger.compoundMinPrice ? 'It has to be lower than the current floor.' : undefined) : undefined;
  const lemxText = (x: bigint) => `${(+Number(formatUnits(x, lemx.decimals)).toFixed(4)).toLocaleString('en-US')} ${lemx.symbol}`;

  if (d.compounding && sw) {
    const n = swapSlices(sw);
    const nextAt = sw.lastSwap + sw.frequency;
    const belowFloor = !sw.done && market18 > 0n && market18 < v.ledger.compoundMinPrice;
    return (
      <Card title="Buying LEMX" help={H.lemx} actions={<Badge tone={sw.done ? 'ok' : belowFloor ? 'warn' : 'info'}>{sw.done ? 'Finished' : belowFloor ? 'Below the floor' : 'Running'}</Badge>}>
        {belowFloor && (
          <Callout tone="warn" title="The market is below the floor">
            Slices only fill at or above the floor, so they're likely being skipped. Lower the floor below the market to keep buying, or wait for the price to come back.
          </Callout>
        )}
        <Line k={`${n.done} of ${n.total} slices`} v={<span className="mg-muted">{sw.done ? 'ready to finish' : sw.lastSwap > 0n ? `next slice ${relative(nextAt, v.now)}` : `a slice every ${duration(Number(sw.frequency))}`}</span>} />
        <Bar value={n.done} total={n.total > 0n ? n.total : 1n} tone={sw.done ? 'ok' : 'info'} label="Slices filled" />
        <Kvs>
          <Kv k={`${v.token.symbol} being swapped`} v={v.amount(s.compoundInFlight)} />
          <Kv k={`${lemx.symbol} bought so far`} v={lemxText(sw.bought)} />
          <Kv k="Floor" help={H.floor} hint="Slices only fill at or above it." v={`${perToken(v.ledger.compoundMinPrice)} ${lemx.symbol} per ${v.token.symbol}`} />
          <Kv k="Market (price feed)" v={market18 ? `${perToken(market18)} ${lemx.symbol} per ${v.token.symbol}` : '—'} />
        </Kvs>
        {sw.done ? (
          <ActionButton
            title="Finish buying LEMX"
            tip={DO.finalizeCompound}
            disabled={fee === null}
            reason="The pool's BNB fee can't be priced right now."
            run={async (ctx) => {
              await ctx.send('Finish buying LEMX', { functionName: 'finalizeCompound', value: fee || undefined });
              ctx.done('LEMX locked in the pool.');
            }}
          >
            Finish and lock the LEMX
          </ActionButton>
        ) : (
          <div className="mg-inline mg-inline-2">
            <Field label="Lower the floor to" help={H.floor} error={nfErr} hint={`${lemx.symbol} per ${v.token.symbol}`}>
              {(id, dd) => <input id={id} aria-describedby={dd} className="mg-input mg-narrow mg-num" inputMode="decimal" placeholder={String(perToken((v.ledger.compoundMinPrice * 95n) / 100n))} value={newFloor} onChange={(e) => setNewFloor(e.target.value)} />}
            </Field>
            <ActionButton
              quiet
              title="Lower the LEMX floor"
              tip={DO.lowerFloor}
              need="MANAGER_ROLE"
              disabled={!nf || !!nfErr}
              reason="Enter a lower floor."
              run={async (ctx) => {
                await ctx.send('Lower the LEMX floor', { functionName: 'escalateFloor', args: [nf!] });
                ctx.done('Floor lowered.');
              }}
              onDone={() => setNewFloor('')}
            >
              Lower floor
            </ActionButton>
            <ConfirmButton
              label="Cancel the purchase"
              tip={DO.cancelLemx}
              title="Cancel the LEMX purchase"
              confirm="Cancel purchase"
              need="MANAGER_ROLE"
              danger
              disabled={fee === null}
              body={<p>What hasn't been swapped goes back to the money set aside for LEMX. The LEMX bought so far is locked in the pool.</p>}
              run={async (ctx) => {
                await ctx.send('Cancel the LEMX purchase', { functionName: 'cancelCompound', value: fee || undefined });
                ctx.done('Purchase cancelled.');
              }}
            />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card title="Buying LEMX" help={H.lemx} subtitle={`Buys ${lemx.symbol} with the money set aside for it, in slices, then locks it in the pool.`}>
      <div className="mg-row-wrap">
        <Stat label="Set aside for LEMX" help="Money from splits waiting for a LEMX purchase to start." value={v.amount(s.compoundPending)} />
        <Stat label="Starting floor" help={H.startingFloor} value={market18 ? String(perToken(floor18)) : '—'} sub={`${lemx.symbol} per ${v.token.symbol} · ${Number(slip) / 100}% under market`} />
      </div>
      {s.lemxHeld > 0n && (
        <Callout
          tone="info"
          title={`${lemxText(s.lemxHeld)} waiting to be locked`}
          action={
            <ActionButton
              small
              title="Lock held LEMX"
              tip={DO.depositHeldLemx}
              disabled={!v.u.lemxLockable || fee === null}
              reason={!v.u.lemxLockable ? "Still below the pool's minimum." : "The pool's BNB fee can't be priced right now."}
              run={async (ctx) => {
                await ctx.send('Lock held LEMX', { functionName: 'depositHeldLemx', value: fee || undefined });
                ctx.done('LEMX locked in the pool.');
              }}
            >
              Lock now
            </ActionButton>
          }
        >
          It was below the pool's minimum when the last purchase finished.
        </Callout>
      )}
      <ActionButton
        title="Start buying LEMX"
        tip={DO.startLemx}
        need="MANAGER_ROLE"
        disabled={s.compoundPending === 0n}
        reason="Nothing is set aside. Split some earnings to LEMX first."
        run={async (ctx) => {
          await ctx.send('Start buying LEMX', { functionName: 'startCompound' });
          ctx.done('LEMX purchase started.');
        }}
      >
        Start buying LEMX {s.compoundPending > 0n ? v.amount(s.compoundPending, 0) : ''}
      </ActionButton>
    </Card>
  );
}

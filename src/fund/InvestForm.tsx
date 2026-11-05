// Investing in a listing's project: amount, the risk summary and
// acknowledgments before a first deposit in the project, the deposit
// confirmation, then approve the exact amount and deposit.
import { useId, useState } from 'react';
import { erc20Abi, parseEventLogs, type Address, type Chain } from 'viem';
import { projectAbi } from './abi';
import type { Disclosures } from './disclosures';
import { CLASS_NAMES, formatAmount, formatDuration, formatTime, parseAmount, plainAmount, ratePercent, shortAddress } from './format';
import type { ProjectData, useWallet } from './queries';
import { Rich, RichLine } from './Rich';
import { useSend } from './tx';

type WalletData = NonNullable<ReturnType<typeof useWallet>['data']>;

interface Props {
  project: Address;
  title: string;
  account: Address;
  chain: Chain;
  token: { address: Address; decimals: number; symbol: string };
  cycleDuration: bigint;
  data: ProjectData;
  wallet: WalletData;
  /** No deposit from this wallet in this project yet: show the risk summary and acknowledgments. */
  first: boolean;
  disclosures: Disclosures;
}

export function InvestForm({ project, title, account, chain, token, cycleDuration, data, wallet, first, disclosures }: Props) {
  const send = useSend();
  const id = useId();
  const [text, setText] = useState('');
  const [acked, setAcked] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: bigint; principal: bigint; maturity: bigint } | null>(null);

  const { state, config } = data;
  const fmt = (v: bigint) => formatAmount(v, token.decimals);
  const amount = (v: bigint) => `${fmt(v)} ${token.symbol}`;
  const rate = wallet.investorClass === 1 ? config.usInterestRate : config.globalInterestRate;
  const remaining = state.raiseCap - state.totalRaised;
  const parsed = parseAmount(text, token.decimals);
  const requested = parsed ?? 0n;
  // deposit() takes min(amount, cap remaining); only that is approved and pulled.
  const fill = requested < remaining ? requested : remaining;
  // Less than the minimum left: only all of it is accepted, since it completes the raise.
  const lastOfRaise = remaining > 0n && remaining < config.minDeposit;
  const acks = disclosures.acknowledgments.filter((a) => a.trim());
  const allAcked = !first || acks.every((_, i) => acked[i]);

  const problem =
    parsed === null
      ? 'Enter an amount, like 10000 or 10000.50.'
      : fill > 0n && fill > wallet.balance
        ? `This wallet has ${amount(wallet.balance)}.`
        : fill > 0n && fill < config.minDeposit && fill !== remaining
          ? lastOfRaise
            ? `Only ${amount(remaining)} is left in this raise, less than the minimum, so invest all of it to complete the raise.`
            : `The minimum investment is ${amount(config.minDeposit)}.`
          : wallet.gasBalance === 0n
            ? `This wallet needs some ${chain.nativeCurrency.symbol} for network fees.`
            : null;
  const needsApproval = wallet.allowance < fill;
  const ready = fill > 0n && !problem && allAcked && !busy;

  const values = {
    company: disclosures.company,
    project: title,
    network: chain.name,
    wallet: shortAddress(account),
    class: CLASS_NAMES[wallet.investorClass],
    rate: ratePercent(rate),
    cycle: formatDuration(cycleDuration),
    fee: ratePercent(config.mgmtRate),
    amount: fmt(fill),
    token: token.symbol,
  };

  async function invest() {
    setBusy(true);
    try {
      const opts = { project, amount: (v: unknown) => amount(BigInt(v as bigint)) };
      if (needsApproval) {
        const approved = await send(`Allow ${amount(fill)}`, { address: token.address, abi: erc20Abi, functionName: 'approve', args: [project, fill] }, opts);
        // A Safe queues the approval for its signers; invest once it has run.
        if (!approved) return;
      }
      const receipt = await send(`Invest ${amount(fill)}`, { address: project, abi: projectAbi, functionName: 'deposit', args: [fill] }, opts);
      if (!receipt) return;
      const [ev] = parseEventLogs({ abi: projectAbi, eventName: 'DepositRecorded', logs: receipt.logs });
      if (ev) setDone({ id: ev.args.depositId, principal: ev.args.principal, maturity: ev.args.maturity });
      setText('');
      setAcked([]);
    } catch {
      // The toast says why.
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="fp-invest">
        <p className="fp-ok fp-done">
          You invested {amount(done.principal)}. Deposit #{String(done.id)}, matures {formatTime(done.maturity, cycleDuration < 86400n)}.
        </p>
        <button type="button" className="fp-btn fp-btn-quiet" onClick={() => setDone(null)}>
          Invest more
        </button>
      </div>
    );
  }

  return (
    <form
      className="fp-invest"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) invest();
      }}
    >
      <p className="fp-muted">
        Approved as a{wallet.investorClass === 2 ? 'n' : ''} {CLASS_NAMES[wallet.investorClass]} investor, at {ratePercent(rate)}% per cycle.
      </p>
      <div className="fp-field">
        <label htmlFor={`${id}-amount`}>Amount</label>
        <div className="fp-input">
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(problem && fill > 0n)}
          />
          <span>{token.symbol}</span>
          <button type="button" onClick={() => setText(plainAmount(wallet.balance < remaining ? wallet.balance : remaining, token.decimals))}>
            Max
          </button>
        </div>
        <p id={`${id}-hint`} className="fp-sub">
          Balance {amount(wallet.balance)} · {lastOfRaise ? `only ${amount(remaining)} left, invest all of it` : `minimum ${amount(config.minDeposit)}`}
        </p>
      </div>
      {problem && (parsed === null || fill > 0n) && <p className="fp-bad fp-problem">{problem}</p>}
      {!problem && requested > remaining && (
        <p className="fp-muted">Only {amount(remaining)} is left in this raise, so you'll invest {amount(remaining)}.</p>
      )}

      {first && (
        <div className="fp-ack">
          {disclosures.riskSummary.trim() && (
            <div className="fp-rich">
              <Rich text={disclosures.riskSummary} values={values} />
            </div>
          )}
          <fieldset>
            <legend>Before your first investment in {title}, confirm each of these:</legend>
            {acks.map((a, i) => (
              <label key={i} className="fp-check">
                <input
                  type="checkbox"
                  checked={Boolean(acked[i])}
                  onChange={(e) => setAcked((prev) => Object.assign([...prev], { [i]: e.target.checked }))}
                />
                <span>
                  <RichLine text={a} values={values} />
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {fill > 0n && !problem && (
        <div className="fp-rich fp-confirm">
          <Rich text={disclosures.confirmation} values={values} />
        </div>
      )}
      <button type="submit" className="fp-btn" disabled={!ready}>
        {busy ? 'Waiting for your wallet…' : needsApproval && fill > 0n ? 'Approve and invest' : 'Invest'}
      </button>
      {needsApproval && fill > 0n && !problem && (
        <p className="fp-sub">
          Your wallet asks twice: first to allow the project to take {amount(fill)}, then to invest it.
        </p>
      )}
    </form>
  );
}

// Raise: progress, placing principal in the pool, the investor allowlist,
// deposits made off the site, and the raise controls.
import { useState } from 'react';
import { isAddress, zeroAddress, type Address } from 'viem';
import { CLASS_NAMES, formatRate } from '../format';
import { feeFor } from './actions';
import { ixProblem, useIxInvestors } from './ix';
import { ActionButton, Addr, AmountInput, Badge, Bar, Callout, Card, ConfirmButton, Empty, Field, Kv, Stat, checkAmount } from './ui';
import { dust, useV } from './view';

export function Raise() {
  const v = useV();
  const s = v.s;
  const remaining = s.raiseCap > s.totalRaised ? s.raiseCap - s.totalRaised : 0n;
  const open = !s.closed && !s.filled;
  return (
    <div className="mg-stack">
      <Card title="Raise progress">
        <div className="mg-grid-3">
          <Stat label="Raised" value={v.amount(s.totalRaised, 0)} sub={`of the ${v.amount(s.raiseCap, 0)} cap`} />
          <Stat label="Left to raise" value={v.amount(remaining, 0)} sub={`minimum investment ${v.amount(v.config.minDeposit, 0)}`} />
          <Stat
            label="Status"
            tone={s.killed || s.paused ? 'warn' : undefined}
            value={s.filled ? 'Fully raised' : s.closed ? 'Closed' : s.killed ? 'Deposits stopped' : s.paused ? 'Paused' : 'Open'}
            sub={`${s.depositCount} deposit${s.depositCount === 1n ? '' : 's'}`}
          />
        </div>
        <Bar value={s.totalRaised} total={s.raiseCap} label="Raised of the cap" />
      </Card>

      <Deploy />
      <Allowlist />
      <div className="mg-grid-2">
        <Credited open={open && !s.killed && !s.paused} remaining={remaining} />
        <Controls />
      </div>
    </div>
  );
}

function Deploy() {
  const v = useV();
  const u = v.s.undeployedPrincipal;
  const min = v.u.poolMinimum;
  const none = u < dust(v);
  const ready = !none && min !== null && u >= min;
  const fee = feeFor(v, 'deposit');
  return (
    <Card title="Place principal in the pool" subtitle="Raised principal is lent into the Loans liquidity pool as the project's pool account, locked for the project's pool term.">
      <div className="mg-row-wrap">
        <Stat label="Waiting to be placed" value={v.amount(none ? 0n : u)} />
        <Stat label="Pool minimum" value={min === null ? '—' : v.amount(min)} />
        <Stat label="Lent in the pool" value={v.amount(v.s.lpPrincipal)} />
        <span className="mg-spacer" />
        <ActionButton
          title="Place principal in the pool"
          disabled={!ready || fee === null}
          reason={none ? 'Nothing to place.' : !ready ? "Below the pool's minimum." : "The pool's BNB fee can't be priced right now."}
          run={async (ctx) => {
            await ctx.send('Place principal in the pool', { functionName: 'deployPrincipal', value: fee || undefined });
            ctx.done('Principal placed in the pool.');
          }}
        >
          Place in the pool
        </ActionButton>
      </div>
      {!none && !ready && <p className="mg-muted">It's below the pool's minimum deposit. It's held safely and goes in once more is raised.</p>}
    </Card>
  );
}

interface Editing {
  investor: Address;
  class: number;
  referrer: string;
}

function Allowlist() {
  const v = useV();
  const { data, error } = useIxInvestors(v.listing.project);
  const [editing, setEditing] = useState<Editing | null>(null);
  const list = (data ?? []).filter((i) => i.allowlisted);
  const removed = (data ?? []).filter((i) => !i.allowlisted);
  return (
    <Card title="Investor allowlist" subtitle="Only approved wallets can invest. The investor type sets the rate for their future deposits.">
      <InvestorForm key={editing?.investor ?? 'new'} initial={editing} onDone={() => setEditing(null)} />
      <div className="mg-gap-top">
        {error ? (
          <Callout tone="warn">{ixProblem(error, 'The allowlist', true)} You can still approve investors above.</Callout>
        ) : !data ? (
          <p className="mg-muted">Loading…</p>
        ) : !list.length ? (
          <Empty title="No approved investors yet" />
        ) : (
          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th scope="col">Investor</th>
                  <th scope="col">Type</th>
                  <th scope="col">Referrer</th>
                  <th scope="col" className="mg-right">
                    Outstanding
                  </th>
                  <th scope="col">
                    <span className="mg-sr">Change</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.investor}>
                    <td>
                      <Addr a={i.investor} />
                    </td>
                    <td>
                      <Badge tone={i.class === 1 ? 'info' : 'brand'}>{CLASS_NAMES[i.class]}</Badge>
                    </td>
                    <td>{i.referrer && i.referrer !== zeroAddress ? <Addr a={i.referrer} /> : <span className="mg-muted">—</span>}</td>
                    <td className="mg-right mg-num">{v.amount(i.principal_active, 0)}</td>
                    <td className="mg-right">
                      {v.can('MANAGER_ROLE') && (
                        <button type="button" className="mg-link" onClick={() => setEditing({ investor: i.investor, class: i.class, referrer: i.referrer ?? '' })}>
                          Change<span className="mg-sr"> {i.investor}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {removed.length > 0 && (
          <p className="mg-muted mg-small-text">
            {removed.length} wallet{removed.length === 1 ? ' was' : 's were'} removed from the allowlist earlier. Their deposits are unaffected.
          </p>
        )}
      </div>
    </Card>
  );
}

function InvestorForm({ initial, onDone }: { initial: Editing | null; onDone: () => void }) {
  const v = useV();
  const [who, setWho] = useState<string>(initial?.investor ?? '');
  const [cls, setCls] = useState(initial?.class ?? 1);
  const [ref, setRef] = useState(initial?.referrer && initial.referrer !== zeroAddress ? initial.referrer : '');
  const whoOk = isAddress(who.trim());
  const refOk = !ref.trim() || isAddress(ref.trim());
  const editing = !!initial;
  return (
    <div className="mg-subpanel">
      <h3>{editing ? 'Change an investor' : 'Approve an investor'}</h3>
      <div className="mg-form-row">
        <Field label="Wallet" error={who.trim() && !whoOk ? "That isn't a wallet address." : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" value={who} onChange={(e) => setWho(e.target.value)} placeholder="0x…" disabled={editing} autoComplete="off" spellCheck={false} />}
        </Field>
        <Field label="Investor type" hint={`US ${formatRate(v.config.usInterestRate)} · International ${formatRate(v.config.globalInterestRate)} per cycle`}>
          {(id, d) => (
            <select id={id} aria-describedby={d} className="mg-input" value={cls} onChange={(e) => setCls(Number(e.target.value))}>
              <option value={1}>US</option>
              <option value={2}>International</option>
              {editing && <option value={0}>Remove from the allowlist</option>}
            </select>
          )}
        </Field>
        <Field label="Referrer (optional)" error={!refOk ? "That isn't a wallet address." : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} />}
        </Field>
      </div>
      <div className="mg-row-wrap">
        <ActionButton
          title={cls === 0 ? 'Remove an investor' : editing ? 'Change an investor' : 'Approve an investor'}
          need="MANAGER_ROLE"
          danger={cls === 0}
          disabled={!whoOk || !refOk}
          reason="Enter a wallet address."
          run={async (ctx) => {
            await ctx.send(cls === 0 ? 'Remove the investor' : 'Approve the investor', { functionName: 'setInvestor', args: [who.trim() as Address, cls, (ref.trim() || zeroAddress) as Address] });
            ctx.done(cls === 0 ? 'Removed from the allowlist.' : `Approved as ${CLASS_NAMES[cls]}.`);
          }}
          onDone={() => {
            setWho('');
            setRef('');
            onDone();
          }}
        >
          {cls === 0 ? 'Remove' : editing ? 'Save' : 'Approve'}
        </ActionButton>
        {editing && (
          <button type="button" className="mg-link" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Credited({ open, remaining }: { open: boolean; remaining: bigint }) {
  const v = useV();
  const { data } = useIxInvestors(v.listing.project);
  const [who, setWho] = useState('');
  const [credit, setCredit] = useState('');
  const [paid, setPaid] = useState('');
  const [c, cErr] = checkAmount(v, credit, { max: remaining, maxLabel: 'is left to raise' });
  const [p, pErr] = checkAmount(v, paid);
  const bps = v.config.maxCreditPremiumBps;
  const maxCredit = p ? (p * (10_000n + bps)) / 10_000n : null;
  const premiumErr = c && maxCredit !== null && c > maxCredit ? `The credit can be at most ${v.amount(maxCredit)} (${Number(bps) / 100}% over the ${v.token.symbol} received).` : undefined;
  const ok = isAddress(who.trim()) && !!c && !!p && !premiumErr;
  return (
    <Card title="Record a deposit made off the site" subtitle={`For a wire or other payment: credit the investor's full principal while paying in the ${v.token.symbol} actually received (after fees on the way in).`}>
      {!open && <Callout tone="warn">Deposits aren't accepted right now (the raise is closed, filled, paused or stopped).</Callout>}
      <div className="mg-form">
        <Field label="Investor" hint="Must be on the allowlist.">
          {(id, d) => (
            <>
              <input id={id} aria-describedby={d} className="mg-input mg-mono" list={`${id}-list`} value={who} onChange={(e) => setWho(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} />
              <datalist id={`${id}-list`}>
                {(data ?? [])
                  .filter((i) => i.allowlisted)
                  .map((i) => (
                    <option key={i.investor} value={i.investor}>
                      {CLASS_NAMES[i.class]}
                    </option>
                  ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="mg-grid-2">
          <Field label="Principal credited" error={cErr ?? premiumErr} hint="What the investor is owed.">
            {(id, d) => <AmountInput id={id} describedBy={d} value={credit} onChange={setCredit} />}
          </Field>
          <Field label={`${v.token.symbol} paid in now`} error={pErr} hint="Taken from your wallet.">
            {(id, d) => <AmountInput id={id} describedBy={d} value={paid} onChange={setPaid} />}
          </Field>
        </div>
        <ActionButton
          title="Record a deposit"
          need="OPERATIONS_ROLE"
          disabled={!ok || !open}
          reason={!open ? "Deposits aren't accepted right now." : 'Fill in the investor and both amounts.'}
          run={async (ctx) => {
            await ctx.send('Record the deposit', { functionName: 'creditedDeposit', args: [who.trim() as Address, c!, p!] }, { pulls: p! });
            ctx.done(`Credited ${v.amount(c!)} to ${who.trim().slice(0, 8)}….`);
          }}
          onDone={() => {
            setCredit('');
            setPaid('');
          }}
        >
          Record deposit
        </ActionButton>
      </div>
    </Card>
  );
}

function Controls() {
  const v = useV();
  const s = v.s;
  return (
    <Card title="Raise controls" subtitle="Admin only. Neither affects investor payments, which never stop.">
      <Kv k="Deposits" hint="Stopping them blocks new investor deposits only. It can be undone any time." v={s.killed ? <Badge tone="bad">Stopped</Badge> : <Badge tone="ok">Open</Badge>} />
      <Kv k="Raise" hint="Closing it is permanent." v={s.closed ? 'Closed' : s.filled ? 'Filled' : 'Open'} />
      <div className="mg-row-wrap mg-gap-top">
        {s.killed ? (
          <ActionButton
            quiet
            title="Resume deposits"
            need="ADMIN_ROLE"
            run={async (ctx) => {
              await ctx.send('Resume deposits', { functionName: 'cancelKill' });
              ctx.done('Deposits resumed.');
            }}
          >
            Resume deposits
          </ActionButton>
        ) : (
          <ConfirmButton
            label="Stop deposits"
            title="Stop investor deposits"
            confirm="Stop deposits"
            need="ADMIN_ROLE"
            danger
            body={<p>New investor deposits and recorded deposits are refused until you resume them. Interest, repayments and everything else keep working.</p>}
            run={async (ctx) => {
              await ctx.send('Stop deposits', { functionName: 'kill' });
              ctx.done('Deposits stopped.');
            }}
          />
        )}
        {!s.closed && (
          <ConfirmButton
            label="Close the raise"
            title="Close the raise for good"
            confirm="Close the raise"
            need="ADMIN_ROLE"
            danger
            body={
              <>
                <p>
                  The raise stops at <strong>{v.amount(s.totalRaised)}</strong> and can never reopen.
                </p>
                <p>Once all principal is repaid, the project counts as fully repaid and what's left in its reserves moves to earnings.</p>
              </>
            }
            run={async (ctx) => {
              await ctx.send('Close the raise', { functionName: 'closeProject' });
              ctx.done('Raise closed.');
            }}
          />
        )}
      </div>
    </Card>
  );
}

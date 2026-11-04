// Settings & team: who holds which role, the payout wallets, ownership,
// pausing, and the project's fixed terms. Wallet and ownership changes are
// two-step: proposed, then accepted by the wallet taking over.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { isAddress, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { projectAbi } from '../abi';
import { formatDuration, formatRate } from '../format';
import { OWNER_ROLE_ID, ROLES, ROLE_ID, ROLE_LABEL, type Role } from '../roles';
import { ixProblem, useIxProject } from './ix';
import { yearly } from './Overview';
import { ActionButton, Addr, Badge, Callout, Card, ConfirmButton, Field, Kv } from './ui';
import { useV } from './view';

const ROLE_HELP: Record<'OWNER_ROLE' | Role, string> = {
  OWNER_ROLE: 'Gives every other role. One wallet, handed over in two steps.',
  ADMIN_ROLE: 'Stops deposits, pauses, closes the raise, proposes wallet changes.',
  MANAGER_ROLE: 'The investor allowlist, splitting earnings, development withdrawals, buying LEMX.',
  OPERATIONS_ROLE: 'Records deposits made off the site. Its repayment money is recorded as from Operations.',
  COMPANY_ROLE: "Renews deposits (pays the investor's renewal fee).",
};
const CARDS = ['OWNER_ROLE', ...ROLES] as const;
const CARD_LABEL = (r: (typeof CARDS)[number]) => (r === 'OWNER_ROLE' ? 'Owner' : ROLE_LABEL[r]);

export function Settings() {
  return (
    <div className="mg-stack">
      <Team />
      <div className="mg-grid-2">
        <Wallets />
        <Ownership />
      </div>
      <div className="mg-grid-2">
        <Pause />
        <Terms />
      </div>
    </div>
  );
}

function Team() {
  const v = useV();
  const ix = useIxProject(v.listing.project);
  const [role, setRole] = useState<Role>('MANAGER_ROLE');
  const [who, setWho] = useState('');
  const members = ix.data?.members ?? [];
  const me = v.account?.toLowerCase();
  return (
    <Card title="Team" subtitle="Who can do what on this project. Roles are per project; nothing is shared between projects.">
      {ix.error ? (
        <>
          <Callout tone="info">{ixProblem(ix.error, 'The lists of role holders')} Check a wallet below instead.</Callout>
          <CheckWallet />
        </>
      ) : (
        <div className="mg-grid-3">
          {CARDS.map((r) => {
            const holders = r === 'OWNER_ROLE' ? [{ account: v.ledger.wallets.owner.toLowerCase() as Address }] : members.filter((m) => m.role === r);
            return (
              <div key={r} className="mg-subpanel">
                <div className="mg-kv">
                  <strong>{CARD_LABEL(r)}</strong>
                  <Badge>{holders.length}</Badge>
                </div>
                <p className="mg-muted mg-small-text">{ROLE_HELP[r]}</p>
                <ul className="mg-rows">
                  {holders.map((m) => (
                    <li key={m.account}>
                      <Addr a={m.account} />
                      {m.account.toLowerCase() === me && <Badge tone="brand">you</Badge>}
                      <span className="mg-spacer" />
                      {r !== 'OWNER_ROLE' &&
                        (m.account.toLowerCase() === me ? (
                          <ActionButton
                            small
                            quiet
                            title={`Give up ${CARD_LABEL(r)}`}
                            run={async (ctx) => {
                              await ctx.send(`Give up the ${CARD_LABEL(r)} role`, { functionName: 'renounceRole', args: [ROLE_ID[r]] });
                              ctx.done('Role given up.');
                            }}
                          >
                            Leave
                          </ActionButton>
                        ) : (
                          v.can('OWNER') && (
                            <ActionButton
                              small
                              quiet
                              title={`Remove ${CARD_LABEL(r)}`}
                              need="OWNER"
                              run={async (ctx) => {
                                await ctx.send(`Remove the ${CARD_LABEL(r)} role`, { functionName: 'revokeRole', args: [ROLE_ID[r], m.account] });
                                ctx.done('Role removed.');
                              }}
                            >
                              Remove
                            </ActionButton>
                          )
                        ))}
                    </li>
                  ))}
                  {!holders.length && <li className="mg-muted">{ix.data ? 'Nobody' : '…'}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <div className="mg-subpanel mg-gap-top">
        <h3>Add a team member</h3>
        <div className="mg-form-row mg-align-end">
          <Field label="Role">
            {(id) => (
              <select id={id} className="mg-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Wallet" error={who.trim() && !isAddress(who.trim()) ? "That isn't a wallet address." : undefined}>
            {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" placeholder="0x…" value={who} onChange={(e) => setWho(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
          <ActionButton
            title={`Give the ${ROLE_LABEL[role]} role`}
            need="OWNER"
            disabled={!isAddress(who.trim())}
            reason="Enter a wallet address."
            run={async (ctx) => {
              await ctx.send(`Give the ${ROLE_LABEL[role]} role`, { functionName: 'grantRole', args: [ROLE_ID[role], who.trim() as Address] });
              ctx.done(`${ROLE_LABEL[role]} role given.`);
            }}
            onDone={() => setWho('')}
          >
            Grant
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

/** Without the indexer: which roles one wallet holds, read from the chain. */
function CheckWallet() {
  const v = useV();
  const client = usePublicClient();
  const [text, setText] = useState('');
  const wallet = isAddress(text.trim()) ? (text.trim() as Address) : null;
  const q = useQuery({
    queryKey: ['fund-roles-of', v.listing.project, wallet],
    enabled: Boolean(client && wallet),
    queryFn: () =>
      client!.multicall({
        allowFailure: false,
        contracts: [OWNER_ROLE_ID, ...ROLES.map((r) => ROLE_ID[r])].map((id) => ({ address: v.listing.project, abi: projectAbi, functionName: 'hasRole', args: [id, wallet!] }) as const),
      }),
  });
  return (
    <div className="mg-subpanel">
      <Field label="Check a wallet" error={text.trim() && !wallet ? "That isn't a wallet address." : undefined}>
        {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" placeholder="0x…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />}
      </Field>
      {q.data && (
        <p>
          {CARDS.filter((_, i) => q.data[i]).map((r) => CARD_LABEL(r)).join(', ') || 'No roles on this project.'}
        </p>
      )}
    </div>
  );
}

function WalletRow({ label, help, current, pending, propose, accept }: { label: string; help: string; current: Address; pending: Address | null; propose: 'proposeCompanyWallet' | 'proposeMgmtFeeWallet'; accept: 'acceptCompanyWallet' | 'acceptMgmtFeeWallet' }) {
  const v = useV();
  const [next, setNext] = useState('');
  const mine = v.account?.toLowerCase() === current.toLowerCase();
  return (
    <div className="mg-wallet-row">
      <div className="mg-kv">
        <span>
          <strong>{label}</strong>
          <small>{help}</small>
        </span>
        <Addr a={current} />
      </div>
      {pending && (
        <Callout
          tone="info"
          title="Change waiting"
          action={
            mine ? (
              <ActionButton
                small
                title={`Accept the ${label.toLowerCase()} change`}
                run={async (ctx) => {
                  await ctx.send(`Accept the ${label.toLowerCase()}`, { functionName: accept });
                  ctx.done(`${label} changed.`);
                }}
              >
                Accept
              </ActionButton>
            ) : undefined
          }
        >
          Moving to <Addr a={pending} />. The current wallet has to accept{mine ? ', and that’s you.' : '.'}
        </Callout>
      )}
      <div className="mg-row-wrap mg-align-end">
        <Field label={`Propose a new ${label.toLowerCase()}`} error={next.trim() && !isAddress(next.trim()) ? "That isn't a wallet address." : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" placeholder="0x…" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>
        <ActionButton
          quiet
          title={`Propose a ${label.toLowerCase()}`}
          need="ADMIN_ROLE"
          disabled={!isAddress(next.trim())}
          reason="Enter a wallet address."
          run={async (ctx) => {
            await ctx.send(`Propose a ${label.toLowerCase()}`, { functionName: propose, args: [next.trim() as Address] });
            ctx.done('Proposed. The current wallet has to accept it.');
          }}
          onDone={() => setNext('')}
        >
          Propose
        </ActionButton>
      </div>
    </div>
  );
}

function Wallets() {
  const v = useV();
  const w = v.ledger.wallets;
  return (
    <Card title="Payout wallets" subtitle="Changes take two steps: an admin proposes, and the current wallet accepts.">
      <WalletRow label="Company wallet" help="Receives development fund withdrawals." current={w.companyWallet} pending={w.pendingCompanyWallet} propose="proposeCompanyWallet" accept="acceptCompanyWallet" />
      <WalletRow label="Management fee wallet" help="Receives management fees every cycle." current={w.mgmtFeeWallet} pending={w.pendingMgmtFeeWallet} propose="proposeMgmtFeeWallet" accept="acceptMgmtFeeWallet" />
    </Card>
  );
}

function Ownership() {
  const v = useV();
  const w = v.ledger.wallets;
  const [to, setTo] = useState('');
  const pendingMe = !!w.pendingOwner && v.account?.toLowerCase() === w.pendingOwner.toLowerCase();
  const ok = isAddress(to.trim());
  return (
    <Card title="Ownership" subtitle="The owner gives roles. Accepting ownership removes every role the previous owner held.">
      <Kv k="Owner" v={<Addr a={w.owner} />} />
      {w.pendingOwner && <Kv k="Offered to" v={<Addr a={w.pendingOwner} />} />}
      {pendingMe && (
        <ActionButton
          title="Accept ownership"
          run={async (ctx) => {
            await ctx.send('Accept ownership', { functionName: 'acceptOwnership' });
            ctx.done('You are now the owner.');
          }}
        >
          Accept ownership
        </ActionButton>
      )}
      <Callout tone="info">Before the new owner accepts, the site manager has to add their wallet to the site's trusted owners, or the project stops showing on this site.</Callout>
      <div className="mg-row-wrap mg-align-end">
        <Field label="New owner" error={to.trim() && !ok ? "That isn't a wallet address." : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} className="mg-input mg-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" spellCheck={false} />}
        </Field>
        <ConfirmButton
          label="Transfer"
          title="Transfer ownership"
          confirm="Offer ownership"
          need="OWNER"
          disabled={!ok}
          body={
            <>
              <p>
                Ownership is offered to <strong className="mg-mono">{to.trim()}</strong>. Nothing changes until that wallet accepts.
              </p>
              <p>When it accepts, your wallet loses the owner role and every other role it holds on this project.</p>
            </>
          }
          run={async (ctx) => {
            await ctx.send('Transfer ownership', { functionName: 'transferOwnership', args: [to.trim() as Address] });
            ctx.done('Ownership offered.');
          }}
        />
      </div>
    </Card>
  );
}

function Pause() {
  const v = useV();
  return (
    <Card title="Pause" subtitle="Pausing stops new deposits and development withdrawals only. Investor interest, collections and repayments keep running.">
      <div className="mg-row-wrap">
        {v.s.paused ? <Badge tone="warn">Paused</Badge> : <Badge tone="ok">Running</Badge>}
        <span className="mg-spacer" />
        {v.s.paused ? (
          <ActionButton
            title="Resume the project"
            need="ADMIN_ROLE"
            run={async (ctx) => {
              await ctx.send('Resume the project', { functionName: 'unpause' });
              ctx.done('Resumed.');
            }}
          >
            Resume
          </ActionButton>
        ) : (
          <ConfirmButton
            label="Pause"
            title="Pause the project"
            confirm="Pause"
            need="ADMIN_ROLE"
            body={<p>Deposits and development fund withdrawals stop until you resume. Investor payments carry on.</p>}
            run={async (ctx) => {
              await ctx.send('Pause the project', { functionName: 'pause' });
              ctx.done('Paused.');
            }}
          />
        )}
      </div>
    </Card>
  );
}

function Terms() {
  const v = useV();
  const c = v.config;
  const us = yearly(v, c.usInterestRate);
  const intl = yearly(v, c.globalInterestRate);
  return (
    <Card title="Project terms" subtitle="Fixed when the project was created.">
      <Kv k="Valuation" v={v.amount(c.valuation, 0)} />
      <Kv k="Raise cap" v={v.amount(c.raiseCap, 0)} />
      <Kv k="Interest, US / International" v={`${formatRate(c.usInterestRate)} / ${formatRate(c.globalInterestRate)} per cycle`} hint={us && intl ? `${us} / ${intl}` : undefined} />
      <Kv k="Management fee" v={`${formatRate(c.mgmtRate)} per cycle`} />
      <Kv k="Cycle" v={formatDuration(v.cycle)} />
      <Kv k="Term / renewal" v={`${formatDuration(c.term)} / ${formatDuration(c.renewalTerm)}`} />
      <Kv k="Renewal fee" v={formatRate(c.renewalFeeRate)} />
      <Kv k="Minimum investment" v={v.amount(c.minDeposit, 0)} />
      <Kv k="Most a recorded deposit can be credited over what was received" v={`${Number(c.maxCreditPremiumBps) / 100}%`} />
      <Kv k="Pool lock (principal / LEMX)" v={`${formatDuration(c.principalLockDuration)} / ${formatDuration(c.compoundLockDuration)}`} />
      <Kv k="LEMX purchase slippage" v={`${Number(c.compoundSlippageBps) / 100}%`} />
    </Card>
  );
}

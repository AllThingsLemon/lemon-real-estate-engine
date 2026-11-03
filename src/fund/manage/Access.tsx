// Access (Owner): grant, revoke or check a role for one address at a time (the
// site never lists who holds a role), and transfer ownership.
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { zeroAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { hasRoleQuery } from '../queries';
import { ROLES, ROLE_ID, ROLE_LABEL, type Role } from '../roles';
import { Addr, AddressField, Section, asAddress, useAction, type ProjectView } from './fields';

export function Access({ v }: { v: ProjectView }) {
  return (
    <div className="fm-tab">
      <RoleForm v={v} />
      <Ownership v={v} />
    </div>
  );
}

function RoleForm({ v }: { v: ProjectView }) {
  const client = usePublicClient();
  const id = useId();
  const { busy, run } = useAction(v);
  const [text, setText] = useState('');
  const [role, setRole] = useState<Role>('MANAGER_ROLE');
  const [sure, setSure] = useState(false);
  const wallet = asAddress(text);
  const has = useQuery(hasRoleQuery(client, v.listing.project, role, wallet));
  const self = wallet !== null && wallet.toLowerCase() === v.account.toLowerCase();
  const label = ROLE_LABEL[role];

  return (
    <Section title="Roles" note="Check, grant or revoke a role for one address at a time. Role holders are never listed on the site.">
      <div className="fm-form">
        <AddressField label="Wallet address" value={text} onChange={setText} />
        <div className="fp-field">
          <label htmlFor={id}>Role</label>
          <select id={id} className="fm-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {wallet && has.data !== undefined && (
          <>
            <p className={has.data ? 'fp-ok' : 'fp-muted'}>
              {self ? 'This wallet' : 'That wallet'} {has.data ? 'has' : "doesn't have"} the {label} role.
            </p>
            {has.data ? (
              <>
                {self && (
                  <label className="fp-check">
                    <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
                    <span>I understand this wallet will lose the {label} role.</span>
                  </label>
                )}
                <button
                  type="button"
                  className="fp-btn fm-danger"
                  disabled={busy || (self && !sure)}
                  onClick={() => run(`Revoke ${label}`, { functionName: 'revokeRole', args: [ROLE_ID[role], wallet] }, () => setSure(false))}
                >
                  {busy ? 'Waiting for your wallet…' : `Revoke ${label}`}
                </button>
              </>
            ) : (
              <button type="button" className="fp-btn" disabled={busy} onClick={() => run(`Grant ${label}`, { functionName: 'grantRole', args: [ROLE_ID[role], wallet] })}>
                {busy ? 'Waiting for your wallet…' : `Grant ${label}`}
              </button>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

function Ownership({ v }: { v: ProjectView }) {
  const { busy, run } = useAction(v);
  const [text, setText] = useState('');
  const [sure, setSure] = useState(false);
  const next = asAddress(text);
  const pending = v.roles.pendingOwner;
  return (
    <Section title="Ownership">
      <p>
        Owner: <Addr address={v.roles.owner} chain={v.chain} /> (this wallet)
      </p>
      {pending && (
        <div className="fm-form">
          <p className="fp-warn">
            Transfer started to <Addr address={pending} chain={v.chain} />. It finishes when that wallet accepts.
          </p>
          <button type="button" className="fp-btn fp-btn-quiet" disabled={busy} onClick={() => run('Cancel the ownership transfer', { functionName: 'transferOwnership', args: [zeroAddress] })}>
            Cancel the transfer
          </button>
        </div>
      )}
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (next && sure && !busy) {
            run('Start an ownership transfer', { functionName: 'transferOwnership', args: [next] }, (r) => {
              if (r) {
                setText('');
                setSure(false);
              }
            });
          }
        }}
      >
        <AddressField label={pending ? 'Transfer to a different wallet' : 'Transfer to'} value={text} onChange={setText} />
        <p className="fp-warn">
          Before the new owner accepts, the site manager has to add them to the site's trusted owners (site.config.json). Until then, the
          listing shows "Investing isn't available" and this page can't open the project.
        </p>
        <label className="fp-check">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>
            I understand that when the new owner accepts, this wallet loses <strong>every</strong> role on this project, Owner included.
          </span>
        </label>
        <button type="submit" className="fp-btn fm-danger" disabled={!next || !sure || busy}>
          {busy ? 'Waiting for your wallet…' : 'Start the transfer'}
        </button>
      </form>
    </Section>
  );
}

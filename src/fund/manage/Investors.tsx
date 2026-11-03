// Investors (Manager): approve a wallet from an investor's subscription
// documents, change its type or revoke it, and see the wallets with deposits.
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { CLASS_NAMES } from '../format';
import { classQuery, classesQuery } from '../queries';
import { plural } from '../ui';
import { Addr, AddressField, Section, asAddress, useAction, type ProjectView } from './fields';

export function Investors({ v }: { v: ProjectView }) {
  return (
    <div className="fm-tab">
      <ApproveForm v={v} />
      <InvestorList v={v} />
    </div>
  );
}

function ApproveForm({ v }: { v: ProjectView }) {
  const client = usePublicClient();
  const id = useId();
  const { busy, run } = useAction(v);
  const [wallet, setWallet] = useState('');
  const [referrer, setReferrer] = useState('');
  const [type, setType] = useState(1);
  const address = asAddress(wallet);
  const referrerAddress = referrer.trim() ? asAddress(referrer) : zeroAddress;
  const current = useQuery(classQuery(client, v.listing.project, address));
  const now = current.data;

  const label =
    now === undefined
      ? 'Approve'
      : type === now
        ? `Already ${type === 0 ? 'not approved' : `a${type === 2 ? 'n' : ''} ${CLASS_NAMES[type]} investor`}`
        : type === 0
          ? 'Revoke approval'
          : now === 0
            ? `Approve as a${type === 2 ? 'n' : ''} ${CLASS_NAMES[type]} investor`
            : `Change to ${CLASS_NAMES[type]}`;
  const ready = Boolean(address && referrerAddress && now !== undefined && type !== now && !busy);

  return (
    <Section
      title="Approve an investor"
      note="Paste the wallet address from the investor's subscription documents. Approval is for this project only."
    >
      <form
        className="fm-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) run(label, { functionName: 'setInvestor', args: [address, type, referrerAddress] });
        }}
      >
        <AddressField
          label="Wallet address"
          value={wallet}
          onChange={setWallet}
          hint={address && now !== undefined ? `Now: ${now === 0 ? 'not approved' : `${CLASS_NAMES[now]} investor`}` : undefined}
        />
        <fieldset className="fm-radios">
          <legend>Investor type</legend>
          {[1, 2, 0].map((t) => (
            <label key={t} htmlFor={`${id}-${t}`}>
              <input id={`${id}-${t}`} type="radio" name={`${id}-type`} checked={type === t} onChange={() => setType(t)} />
              {t === 0 ? 'Not approved (revoke)' : CLASS_NAMES[t]}
            </label>
          ))}
        </fieldset>
        <AddressField label="Referred by (optional)" value={referrer} onChange={setReferrer} hint="Recorded on-chain with the approval." />
        <p className="fp-muted">A change applies to future deposits only. Existing deposits keep their rate.</p>
        <button type="submit" className="fp-btn" disabled={!ready}>
          {busy ? 'Waiting for your wallet…' : label}
        </button>
      </form>
    </Section>
  );
}

/** Wallets with deposits, from the deposit records. Approved wallets that haven't invested need event history to list. */
function InvestorList({ v }: { v: ProjectView }) {
  const client = usePublicClient();
  const byWallet = new Map<string, { wallet: Address; principal: bigint; active: number; total: number }>();
  for (const d of v.deposits) {
    const key = d.investor.toLowerCase();
    const row = byWallet.get(key) ?? { wallet: d.investor, principal: 0n, active: 0, total: 0 };
    row.total++;
    if (!d.repaid) {
      row.active++;
      row.principal += d.principal;
    }
    byWallet.set(key, row);
  }
  const rows = [...byWallet.values()].sort((a, b) => (b.principal > a.principal ? 1 : b.principal < a.principal ? -1 : 0));
  const classes = useQuery(classesQuery(client, v.listing.project, rows.map((r) => r.wallet)));

  return (
    <Section
      wide
      title={`Investors with deposits (${rows.length})`}
      note="Approved wallets that haven't invested yet aren't listed: that needs event history the site can't read without a backend."
    >
      {rows.length === 0 ? (
        <p className="fp-muted">No deposits yet.</p>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr>
                <th scope="col">Wallet</th>
                <th scope="col">Type now</th>
                <th scope="col">Deposits</th>
                <th scope="col" className="fm-num">
                  Principal outstanding
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.wallet}>
                  <td>
                    <Addr address={r.wallet} chain={v.chain} />
                  </td>
                  <td>{classes.data ? (classes.data[i] === 0 ? 'Not approved' : CLASS_NAMES[classes.data[i]]) : '…'}</td>
                  <td>
                    {r.active} active{r.total > r.active && `, ${r.total - r.active} repaid`}
                  </td>
                  <td className="fm-num">{v.amount(r.principal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fp-sub">{plural(v.deposits.length, 'deposit')} in all.</p>
    </Section>
  );
}

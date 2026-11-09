// /manage/#new: create a project through the site's factory, as the fund
// dashboard's New project page does (real-estate-fund dashboard/src/pages/
// CreateProject.tsx), on one page. The form checks every term the factory
// checks (ProjectFactory.validateParams), so a bad one shows next to its
// field, and validateParams itself runs as a preflight before the wallet
// opens. One check is the site's own: the minimum investment has to reach the
// pool's minimum (poolFloor). Only the site's trusted owners get the form: a project owned by any
// other wallet would never show on this site. Once it's created, the project
// is linked to a listing in the editor (LinkToListing), the one place site
// content is written.
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { decodeEventLog, erc20Abi, isAddress, parseAbi, parseUnits, toHex, zeroAddress, type Address, type Chain, type PublicClient, type TransactionReceipt } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import type { Editor } from '../WalletIsland';
import { projectFactoryAbi } from '../abi';
import { explain } from '../errors';
import { formatAmount, formatDuration, formatRate, parseAmount, shortAddress } from '../format';
import { projectTitle, rememberCreated } from '../projects';
import { poolAbi, type Owner, type Trust } from '../queries';
import { useSend } from '../tx';
import { CREATE_HELP, DO } from './help';
import { useTip } from './Tip';
import { Callout, Card, Empty, Field, Kv, Kvs, Skeleton, TipButton, TipLink } from './ui';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The pool's lock periods (IFactoryPool in ProjectFactory.sol). */
const poolTiersAbi = parseAbi([
  'struct LockDurationTier { uint256 duration; uint256 interestMultiplier; bool isEnabled; }',
  'function getAssetLockTiers(address token) view returns (LockDurationTier[])',
]);

/** The factory's fixed limits (ProjectFactory.sol): rates in 1e8 = 100%, the cap at most 80% of the valuation. */
const PCT = 100_000_000n;
const BPS = 10_000n;
const MAX_RAISE_PCT = 80_000_000n;
/** The indexer takes a few seconds to list a new project. */
const INDEXER_LAG_MS = 6_000;

async function readFactory(client: PublicClient, address: Address) {
  const [version, cycle, usdt, lemx, pool] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address, abi: projectFactoryAbi, functionName: 'VERSION' },
      { address, abi: projectFactoryAbi, functionName: 'cycleDuration' },
      { address, abi: projectFactoryAbi, functionName: 'usdt' },
      { address, abi: projectFactoryAbi, functionName: 'lemx' },
      { address, abi: projectFactoryAbi, functionName: 'pool' },
    ],
  });
  return { address, version, cycle, usdt, lemx, pool };
}

/**
 * The factory new projects come from: the newest version among the site's
 * factories (a new contract version always means a new factory), with its
 * token and the lock periods its pool offers.
 */
const factoryQuery = (client: PublicClient | undefined, factories: readonly Address[]) =>
  queryOptions({
    queryKey: ['fund-factory', factories.join()],
    staleTime: 60_000,
    enabled: Boolean(client),
    queryFn: async () => {
      const read = await Promise.allSettled(factories.map((f) => readFactory(client!, f)));
      const found = read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (!found.length) throw new Error("None of this site's factories (fund.factories) answered on this network.");
      const f = found.reduce((a, b) => (b.version > a.version ? b : a));
      const [decimals, symbol, lemxSymbol, usdtTiers, lemxTiers] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: f.usdt, abi: erc20Abi, functionName: 'decimals' },
          { address: f.usdt, abi: erc20Abi, functionName: 'symbol' },
          { address: f.lemx, abi: erc20Abi, functionName: 'symbol' },
          { address: f.pool, abi: poolTiersAbi, functionName: 'getAssetLockTiers', args: [f.usdt] },
          { address: f.pool, abi: poolTiersAbi, functionName: 'getAssetLockTiers', args: [f.lemx] },
        ],
      });
      // Longest first: the dashboard's default is the longest period.
      const enabled = (tiers: readonly { duration: bigint; isEnabled: boolean }[]) =>
        tiers.filter((t) => t.isEnabled).map((t) => t.duration).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      const [min, feeTo, feeBps, denom] = await client!.multicall({
        contracts: [
          { address: f.pool, abi: poolAbi, functionName: 'minimumDepositValue' },
          { address: f.pool, abi: poolAbi, functionName: 'feeReceiver' },
          { address: f.pool, abi: poolAbi, functionName: 'FEE_BPS' },
          { address: f.pool, abi: poolAbi, functionName: 'BPS_DENOMINATOR' },
        ],
      });
      const pool = poolFloor(min.result ?? null, feeTo.result ?? null, feeBps.result ?? null, denom.result ?? null, decimals);
      return { ...f, token: { decimals, symbol }, lemxSymbol, tiers: { principal: enabled(usdtTiers), lemx: enabled(lemxTiers) }, pool };
    },
  });

type Factory = Awaited<ReturnType<NonNullable<ReturnType<typeof factoryQuery>['queryFn']>>>;

/**
 * The smallest deposit the project can place in the pool on its own
 * (Project.deployPrincipal): what's left after the pool's fee, which the pool
 * takes on top, has to reach the pool's minimum. Smaller deposits wait until
 * enough builds up, so the form holds the minimum investment to this. Rounded
 * up to a cent. Null when the pool doesn't say.
 */
function poolFloor(min: bigint | null, feeTo: Address | null, feeBps: bigint | null, denom: bigint | null, decimals: number) {
  if (min === null || min <= 1n) return null;
  const fee = feeTo && feeTo !== zeroAddress && feeBps && denom ? { bps: feeBps, denom } : null;
  const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
  const gross = fee ? ceilDiv((min - 1n) * (fee.denom + fee.bps), fee.denom) : min - 1n;
  const cent = decimals > 2 ? 10n ** BigInt(decimals - 2) : 1n;
  return { min, floor: ceilDiv(gross, cent) * cent, fee: fee ? `${(Number(fee.bps) * 100) / Number(fee.denom)}%` : null };
}

type Unit = 'cycles' | 'minutes' | 'hours' | 'days' | 'years';
const UNIT_SECONDS: Record<Exclude<Unit, 'cycles'>, bigint> = { minutes: 60n, hours: 3600n, days: 86_400n, years: 365n * 86_400n };

interface Form {
  name: string;
  docs: string;
  valuation: string;
  raiseCap: string;
  minDeposit: string;
  us: string;
  intl: string;
  mgmt: string;
  renewal: string;
  term: string;
  termUnit: Unit;
  renewalTerm: string;
  renewalUnit: Unit;
  principalLock: string;
  lemxLock: string;
  slippage: string;
  premium: string;
  owner: string;
  company: string;
  fee: string;
}

// The interest rates and the management fee start at the usual terms (per
// cycle), chosen with Jake on Nov 9. The renewal fee, amounts and term start
// empty, so they're chosen, not accepted by default. The two limits start at
// the fund dashboard's values.
const BLANK: Form = {
  name: '',
  docs: '',
  valuation: '',
  raiseCap: '',
  minDeposit: '',
  us: '2',
  intl: '3',
  mgmt: '0.5',
  renewal: '',
  term: '',
  termUnit: 'cycles',
  renewalTerm: '',
  renewalUnit: 'cycles',
  principalLock: '',
  lemxLock: '',
  slippage: '3',
  premium: '5',
  owner: '',
  company: '',
  fee: '',
};

/** A typed percentage → the factory's units (`places` 6: 1e8 = 100%; 2: basis points). Null when it isn't one. */
function percent(text: string, places: number): bigint | null {
  const clean = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  return parseUnits(clean, places);
}

/** A typed length of time → seconds. Null when it isn't a number. */
function seconds(text: string, unit: Unit, cycle: bigint): bigint | null {
  const clean = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  // Whole seconds, from a number that may have decimals ("2.5 years").
  const thousandths = parseUnits(clean, 3);
  return (thousandths * (unit === 'cycles' ? cycle : UNIT_SECONDS[unit])) / 1000n;
}

/** "≈ 26.4% a year" for cycles of a day or more (the sandbox's 5-minute cycles would read absurdly). */
function perYear(rate: bigint, cycle: bigint): string | null {
  if (cycle < 86_400n) return null;
  const y = (Number(rate) / 1e6) * ((365 * 86400) / Number(cycle));
  return `≈ ${y >= 1000 ? Math.round(y).toLocaleString('en-US') : +y.toFixed(2)}% a year`;
}

/** Every term checked as validateParams checks it: the parameters, or why each field is wrong. */
function check(f: Form, factory: Factory, account: Address | undefined, owners: Owner[]) {
  const errors: Partial<Record<keyof Form, string>> = {};
  const amount = (key: 'valuation' | 'raiseCap' | 'minDeposit') => {
    const v = parseAmount(f[key], factory.token.decimals);
    if (!f[key].trim()) errors[key] = 'Required.';
    else if (v === null) errors[key] = 'Enter a number.';
    else if (v <= 0n) errors[key] = 'Enter more than zero.';
    return v ?? 0n;
  };
  const rate = (key: 'us' | 'intl' | 'mgmt' | 'renewal', places: number, zeroOk: boolean) => {
    const v = percent(f[key], places);
    if (!f[key].trim()) errors[key] = zeroOk ? 'Required (0 for none).' : 'Required.';
    else if (v === null) errors[key] = 'Enter a percentage.';
    else if (!zeroOk && v === 0n) errors[key] = 'Enter more than zero.';
    else if (v > PCT) errors[key] = 'At most 100%.';
    return v ?? 0n;
  };
  const time = (key: 'term' | 'renewalTerm', unit: Unit) => {
    const v = seconds(f[key], unit, factory.cycle);
    if (!f[key].trim()) errors[key] = 'Required.';
    else if (v === null) errors[key] = 'Enter a number.';
    else if (v <= 0n) errors[key] = 'Enter more than zero.';
    return v ?? 0n;
  };
  const wallet = (key: 'company' | 'fee') => {
    const v = f[key].trim() || account || '';
    if (f[key].trim() && !isAddress(f[key].trim())) errors[key] = "That isn't a wallet address.";
    else if (v && same(v, zeroAddress)) errors[key] = "The zero address can't receive anything.";
    return (isAddress(v) ? v : zeroAddress) as Address;
  };

  const name = f.name.trim();
  if (!name) errors.name = 'Give the project a name.';
  const valuation = amount('valuation');
  const raiseCap = amount('raiseCap');
  const minDeposit = amount('minDeposit');
  const capLimit = (valuation * MAX_RAISE_PCT) / PCT;
  if (!errors.raiseCap && !errors.valuation && raiseCap > capLimit) errors.raiseCap = `At most 80% of the valuation (${formatAmount(capLimit, factory.token.decimals, 0)} ${factory.token.symbol}).`;
  // Not a factory rule: below this, a deposit can't go into the pool on its own (poolFloor).
  const floor = factory.pool?.floor;
  const floorText = floor && `${formatAmount(floor, factory.token.decimals)} ${factory.token.symbol}`;
  if (!errors.raiseCap && floor && raiseCap < floor) errors.raiseCap = `At least ${floorText}, the smallest deposit the pool can take.`;
  if (!errors.minDeposit && !errors.raiseCap && minDeposit > raiseCap) errors.minDeposit = "Can't be more than the raise cap.";
  if (!errors.minDeposit && floor && minDeposit < floor) errors.minDeposit = `At least ${floorText}, so each deposit can go into the pool on its own.`;
  const usInterestRate = rate('us', 6, false);
  const globalInterestRate = rate('intl', 6, false);
  const mgmtRate = rate('mgmt', 6, true);
  const renewalFeeRate = rate('renewal', 6, true);
  const slippage = percent(f.slippage, 2);
  if (slippage === null) errors.slippage = 'Enter a percentage.';
  else if (slippage >= BPS) errors.slippage = 'Less than 100%.';
  const premium = percent(f.premium, 2);
  if (premium === null) errors.premium = 'Enter a percentage.';
  else if (premium > BPS) errors.premium = 'At most 100%.';
  const term = time('term', f.termUnit);
  const renewalTerm = time('renewalTerm', f.renewalUnit);
  const principalLock = BigInt(f.principalLock || 0);
  if (!factory.tiers.principal.includes(principalLock)) errors.principalLock = 'Choose one of the periods the pool offers.';
  const lemxLock = BigInt(f.lemxLock || 0);
  if (!factory.tiers.lemx.includes(lemxLock)) errors.lemxLock = 'Choose one of the periods the pool offers.';
  const owner = owners.find((o) => same(o.address, f.owner))?.address;
  if (!owner) errors.owner = "Choose one of this site's trusted owners.";
  const companyWallet = wallet('company');
  const mgmtFeeWallet = wallet('fee');

  const params = {
    name,
    metadataURI: f.docs.trim(),
    valuation,
    raiseCap,
    usInterestRate,
    globalInterestRate,
    mgmtRate,
    renewalFeeRate,
    companyWallet,
    mgmtFeeWallet,
    principalLockDuration: principalLock,
    compoundLockDuration: lemxLock,
    compoundSlippageBps: slippage ?? 0n,
    minDeposit,
    maxCreditPremiumBps: premium ?? 0n,
    term,
    renewalTerm,
  };
  return { params, owner: owner ?? zeroAddress, errors, capLimit, ok: Object.keys(errors).length === 0 && Boolean(account) };
}

/** The new project's address, from the factory's ProjectCreated event. */
function createdAddress(rc: TransactionReceipt, factory: Address): Address | null {
  for (const l of rc.logs) {
    if (!same(l.address, factory)) continue;
    try {
      const d = decodeEventLog({ abi: projectFactoryAbi, data: l.data, topics: l.topics });
      if (d.eventName === 'ProjectCreated') return d.args.project;
    } catch {
      // Not the factory's event.
    }
  }
  return null;
}

export function CreateProject({ trust, owners, editor, chain }: { trust: Trust; owners: Owner[]; editor: Editor | null; chain: Chain }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const factory = useQuery(factoryQuery(client, trust.factories));
  const [created, setCreated] = useState<{ project: Address; name: string; queued: boolean } | null>(null);
  const trusted = Boolean(address && owners.some((o) => same(o.address, address)));
  const back = (
    <TipLink className="mg-back" tip="Back to this site’s projects." href="#">
      <span aria-hidden="true">←</span> All projects
    </TipLink>
  );

  let body: ReactNode;
  if (created) body = <Created {...created} chain={chain} editor={editor} />;
  else if (!address)
    body = (
      <div className="mg-card">
        <Empty title="Connect a trusted owner's wallet">
          Projects are created by one of this site's trusted owners.{' '}
          <button type="button" className="mg-link" onClick={() => openConnectModal?.()}>
            Connect a wallet
          </button>
          .
        </Empty>
      </div>
    );
  else if (!trusted)
    body = (
      <div className="mg-card">
        <Empty title="This wallet can't create projects here" icon="!">
          Only this site's trusted owners can, because a project owned by any other wallet wouldn't show on the site. Someone who can publish the site can add this wallet ({shortAddress(address)}) under Site settings → Project owners in the editor. It applies once the site has rebuilt.
        </Empty>
      </div>
    );
  else if (factory.error)
    body = (
      <div className="mg-card">
        <Empty title="Couldn't read the factory" icon="!">
          {explain(factory.error)} Reload the page to try again.
        </Empty>
      </div>
    );
  else if (!factory.data) body = <Skeleton tall />;
  else body = <CreateForm factory={factory.data} account={address} owners={owners} chain={chain} onCreated={setCreated} />;

  return (
    <div className="mg-project">
      {back}
      <div className="mg-project-head">
        <h2>New project</h2>
      </div>
      <p className="mg-muted">Creates the project's contract on {chain.name}, owned by one of this site's trusted owners. Its terms are fixed once it's created.</p>
      {body}
    </div>
  );
}

function CreateForm({ factory, account, owners, chain, onCreated }: { factory: Factory; account: Address; owners: Owner[]; chain: Chain; onCreated: (c: { project: Address; name: string; queued: boolean }) => void }) {
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const send = useSend();
  const [f, setF] = useState<Form>(() => ({
    ...BLANK,
    // The owner list's own spelling, so the select shows it.
    owner: owners.find((o) => same(o.address, account))?.address ?? '',
    principalLock: String(factory.tiers.principal[0] ?? ''),
    lemxLock: String(factory.tiers.lemx[0] ?? ''),
  }));
  // A field's error shows once it's been left, or once Create is pressed.
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // The salt makes the address; one per visit, so the preflight's address is the one created.
  const [salt] = useState(() => toHex(crypto.getRandomValues(new Uint8Array(32))));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const leave = (k: keyof Form) => () => setTouched((t) => ({ ...t, [k]: true }));

  const c = useMemo(() => check(f, factory, account, owners), [f, factory, account, owners]);
  const err = (k: keyof Form) => (tried || touched[k] ? c.errors[k] : undefined);
  const { decimals, symbol } = factory.token;
  const amount = (v: unknown) => `${formatAmount(BigInt(v as bigint), decimals, 0)} ${symbol}`;
  const cycle = formatDuration(factory.cycle);

  const preflight = useQuery({
    queryKey: ['fund-create-preflight', factory.address, JSON.stringify(c.params, (_, x) => (typeof x === 'bigint' ? x.toString() : x)), c.owner, account, salt],
    enabled: c.ok && Boolean(client),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      await client!.readContract({ address: factory.address, abi: projectFactoryAbi, functionName: 'validateParams', args: [c.params] });
      return client!.readContract({ address: factory.address, abi: projectFactoryAbi, functionName: 'predictProjectAddress', args: [account, c.owner, salt] });
    },
  });

  async function create() {
    setTried(true);
    if (!c.ok || !preflight.data || busy) return;
    setBusy(true);
    try {
      const { params } = c;
      const rc = await send('Create project', { address: factory.address, abi: projectFactoryAbi, functionName: 'createProject', args: [c.owner, params, salt] }, { project: preflight.data, amount });
      const project = (rc && createdAddress(rc, factory.address)) || preflight.data;
      rememberCreated(chain.id, project, params.name);
      // Once the indexer has it, the project list comes from there.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['fund-ix', 'projects'] }), INDEXER_LAG_MS);
      onCreated({ project, name: params.name, queued: !rc });
    } catch {
      // The toast says why, and the form keeps what was typed.
    } finally {
      setBusy(false);
    }
  }

  const unitSelect = (key: 'termUnit' | 'renewalUnit', label: string) => (
    <select aria-label={label} value={f[key]} onChange={(e) => set(key, e.target.value as Unit)}>
      {(['cycles', 'days', 'years', ...(factory.cycle < 86_400n ? (['minutes', 'hours'] as const) : [])] as Unit[]).map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
  const input = (key: keyof Form, id: string, d: string | undefined, extra: { suffix?: ReactNode; placeholder?: string; mono?: boolean; decimal?: boolean } = {}) => {
    const el = (
      <input
        id={id}
        aria-describedby={d}
        aria-invalid={err(key) ? true : undefined}
        className={extra.suffix ? undefined : `mg-input${extra.mono ? ' mg-mono' : ''}`}
        inputMode={extra.decimal ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={extra.placeholder}
        value={f[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        onBlur={leave(key)}
      />
    );
    return extra.suffix ? (
      <div className="mg-amount">
        {el}
        {typeof extra.suffix === 'string' ? <span>{extra.suffix}</span> : extra.suffix}
      </div>
    ) : (
      el
    );
  };
  const rateHint = (key: 'us' | 'intl' | 'mgmt', base: string) => {
    const r = percent(f[key], 6);
    return (r && perYear(r, factory.cycle)) || base;
  };
  const tierSelect = (key: 'principalLock' | 'lemxLock', tiers: readonly bigint[], id: string, d: string | undefined) =>
    tiers.length ? (
      <select id={id} aria-describedby={d} className="mg-input" value={f[key]} onChange={(e) => set(key, e.target.value)}>
        {tiers.map((t) => (
          <option key={String(t)} value={String(t)}>
            {formatDuration(t)}
          </option>
        ))}
      </select>
    ) : (
      <select id={id} aria-describedby={d} className="mg-input" disabled value="">
        <option value="">None offered right now</option>
      </select>
    );

  return (
    <div className="mg-stack">
      <Card title="Project" help={CREATE_HELP.project}>
        <div className="mg-form">
          <Field label="Name" hint="Shown on /manage/ until a listing links to the project, and recorded on-chain." error={err('name')}>
            {(id, d) => input('name', id, d, { placeholder: 'e.g. Maple Court Townhomes' })}
          </Field>
          <Field label="Offering documents link (optional)" hint="Recorded on-chain with the project, e.g. an https or ipfs:// link. Don't put anything private here: anyone can read it.">
            {(id, d) => input('docs', id, d, { placeholder: 'https://…', mono: true })}
          </Field>
        </div>
      </Card>

      <Card title="Raise" help={CREATE_HELP.raise}>
        <div className="mg-form-row">
          <Field label="Valuation" hint="The property's value, such as its purchase price." error={err('valuation')}>
            {(id, d) => input('valuation', id, d, { suffix: symbol, decimal: true, placeholder: '0' })}
          </Field>
          <Field label="Raise cap" hint={c.capLimit > 0n ? `At most ${amount(c.capLimit)} (80% of the valuation).` : 'At most 80% of the valuation.'} error={err('raiseCap')}>
            {(id, d) => input('raiseCap', id, d, { suffix: symbol, decimal: true, placeholder: '0' })}
          </Field>
          <Field
            label="Minimum investment"
            hint={
              factory.pool
                ? `The smallest deposit an investor can make. At least ${formatAmount(factory.pool.floor, factory.token.decimals)} ${symbol}: the pool takes ${formatAmount(factory.pool.min, factory.token.decimals)} ${symbol} or more${factory.pool.fee ? `, after its ${factory.pool.fee} fee` : ''}.`
                : 'The smallest deposit an investor can make.'
            }
            error={err('minDeposit')}
          >
            {(id, d) => input('minDeposit', id, d, { suffix: symbol, decimal: true, placeholder: '0' })}
          </Field>
        </div>
      </Card>

      <Card title="Interest and fees" help={CREATE_HELP.rates} subtitle={`Rates are per cycle. A cycle is ${cycle} on this factory.`}>
        <div className="mg-form-row">
          <Field label="US investors' interest" hint={rateHint('us', 'Per cycle, on their principal.')} error={err('us')}>
            {(id, d) => input('us', id, d, { suffix: '% per cycle', decimal: true })}
          </Field>
          <Field label="International investors' interest" hint={rateHint('intl', 'The same rate as US investors reads as one rate on the site.')} error={err('intl')}>
            {(id, d) => input('intl', id, d, { suffix: '% per cycle', decimal: true })}
          </Field>
        </div>
        <div className="mg-form-row">
          <Field label="Management fee" hint={rateHint('mgmt', 'Per cycle, on outstanding principal. 0 for none.')} error={err('mgmt')}>
            {(id, d) => input('mgmt', id, d, { suffix: '% per cycle', decimal: true })}
          </Field>
          <Field label="Renewal fee" hint="Once, on the principal of a deposit the company renews. 0 for none." error={err('renewal')}>
            {(id, d) => input('renewal', id, d, { suffix: '% once', decimal: true })}
          </Field>
        </div>
      </Card>

      <Card title="Term" help={CREATE_HELP.term}>
        <div className="mg-form-row">
          <Field label="Investor term" hint={termHint(f.term, f.termUnit, factory.cycle, 'How long after each deposit it has to be repaid.')} error={err('term')}>
            {(id, d) => input('term', id, d, { suffix: unitSelect('termUnit', 'Investor term unit'), decimal: true })}
          </Field>
          <Field label="Renewal extension" hint={termHint(f.renewalTerm, f.renewalUnit, factory.cycle, 'Added once when the company renews a deposit.')} error={err('renewalTerm')}>
            {(id, d) => input('renewalTerm', id, d, { suffix: unitSelect('renewalUnit', 'Renewal extension unit'), decimal: true })}
          </Field>
        </div>
      </Card>

      <Card title="Pool and LEMX" help={CREATE_HELP.pool}>
        <div className="mg-form-row">
          <Field label="Pool lock for principal" hint="How long raised principal stays locked in the pool. Only the periods the pool offers." error={err('principalLock')}>
            {(id, d) => tierSelect('principalLock', factory.tiers.principal, id, d)}
          </Field>
          <Field label={`Pool lock for ${factory.lemxSymbol}`} hint={`How long ${factory.lemxSymbol} bought with set-aside earnings stays locked.`} error={err('lemxLock')}>
            {(id, d) => tierSelect('lemxLock', factory.tiers.lemx, id, d)}
          </Field>
        </div>
        <div className="mg-form-row">
          <Field label={`${factory.lemxSymbol} purchase slippage`} hint="How far below the price feed a purchase may fill." error={err('slippage')}>
            {(id, d) => input('slippage', id, d, { suffix: '%', decimal: true })}
          </Field>
          <Field label="Credit premium limit" hint="For deposits recorded off the site: how far the credited principal may exceed what was received." error={err('premium')}>
            {(id, d) => input('premium', id, d, { suffix: '%', decimal: true })}
          </Field>
        </div>
      </Card>

      <Card title="Wallets" help={CREATE_HELP.wallets}>
        <div className="mg-form">
          <Field label="Owner" hint="Gets the Owner and Admin roles and gives out the others, such as Manager. Only this site's trusted owners are listed." error={err('owner')}>
            {(id, d) => (
              <select id={id} aria-describedby={d} className="mg-input" value={f.owner} onChange={(e) => set('owner', e.target.value)}>
                {owners.map((o) => (
                  <option key={o.address} value={o.address}>
                    {[o.name, same(o.address, account) ? 'your wallet' : ''].filter(Boolean).join(', ') || shortAddress(o.address)} · {o.address}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="mg-form-row">
            <Field label="Company wallet" hint="Receives development funds. Empty: your wallet." error={err('company')}>
              {(id, d) => input('company', id, d, { placeholder: account, mono: true })}
            </Field>
            <Field label="Management fee wallet" hint="Receives the management fee every cycle. Empty: your wallet." error={err('fee')}>
              {(id, d) => input('fee', id, d, { placeholder: account, mono: true })}
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Review and create" help={CREATE_HELP.review} subtitle="The terms can't be changed after this.">
        <Kvs>
          <Kv k="Name" v={c.params.name || '—'} />
          <Kv k="Valuation / raise cap" v={`${amount(c.params.valuation)} / ${amount(c.params.raiseCap)}`} />
          <Kv k="Minimum investment" v={amount(c.params.minDeposit)} />
          <Kv
            k={c.params.usInterestRate === c.params.globalInterestRate ? 'Interest' : 'Interest, US / International'}
            v={
              c.params.usInterestRate === c.params.globalInterestRate
                ? `${formatRate(c.params.usInterestRate)} per cycle`
                : `${formatRate(c.params.usInterestRate)} / ${formatRate(c.params.globalInterestRate)} per cycle`
            }
          />
          <Kv k="Management fee / renewal fee" v={`${formatRate(c.params.mgmtRate)} per cycle / ${formatRate(c.params.renewalFeeRate)} once`} />
          <Kv k="Cycle" v={cycle} />
          <Kv k="Term / renewal" v={`${c.params.term ? formatDuration(c.params.term) : '—'} / ${c.params.renewalTerm ? formatDuration(c.params.renewalTerm) : '—'}`} />
          <Kv k={`Pool lock (principal / ${factory.lemxSymbol})`} v={`${c.params.principalLockDuration ? formatDuration(c.params.principalLockDuration) : '—'} / ${c.params.compoundLockDuration ? formatDuration(c.params.compoundLockDuration) : '—'}`} />
          <Kv k="Owner" v={<span className="mg-mono">{shortAddress(c.owner)}</span>} />
          <Kv k="Company / fee wallet" v={<span className="mg-mono">{`${shortAddress(c.params.companyWallet)} / ${shortAddress(c.params.mgmtFeeWallet)}`}</span>} />
        </Kvs>
        <div className="mg-stack mg-create-foot">
          {!c.ok ? (
            tried && <Callout tone="warn">Some terms need fixing first. Each one says why.</Callout>
          ) : preflight.isPending ? (
            <Callout tone="info">Checking the terms with the factory…</Callout>
          ) : preflight.error ? (
            <Callout tone="bad" title="The factory would refuse these terms">
              {explain(preflight.error, amount)}
            </Callout>
          ) : (
            <Callout tone="ok" title="Ready to create">
              The project's address will be <span className="mg-mono">{preflight.data}</span>.
            </Callout>
          )}
          <CreateButton busy={busy} off={c.ok && !preflight.data} onClick={create} />
        </div>
      </Card>
    </div>
  );
}

/** A term's hint, with what it comes to in cycles. */
function termHint(text: string, unit: Unit, cycle: bigint, base: string) {
  const s = seconds(text, unit, cycle);
  if (!s) return base;
  const cycles = Number(s) / Number(cycle);
  const n = Number.isInteger(cycles) ? cycles.toLocaleString('en-US') : `about ${cycles.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
  return `${formatDuration(s)}, ${n} cycle${cycles === 1 ? '' : 's'}. ${base}`;
}

function CreateButton({ busy, off, onClick }: { busy: boolean; off: boolean; onClick: () => void }) {
  const t = useTip(CREATE_HELP.create);
  return (
    <span className="mg-act">
      <button type="button" className="mg-btn" {...t.trigger} aria-disabled={off || busy || undefined} aria-busy={busy || undefined} onClick={onClick}>
        {busy ? 'Waiting for your wallet…' : 'Create project'}
      </button>
      {t.bubble}
    </span>
  );
}

/** After creating: where the project is, and putting it on a listing. */
function Created({ project, name, queued, chain, editor }: { project: Address; name: string; queued: boolean; chain: Chain; editor: Editor | null }) {
  const explorer = chain.blockExplorers?.default;
  return (
    <div className="mg-stack">
      <Callout tone={queued ? 'info' : 'ok'} title={queued ? 'Sent to your Safe' : `${projectTitle(project, name)} is created`}>
        {queued ? 'Once the other signers approve it in Safe{Wallet}, the project will be at' : 'Its address is'} <span className="mg-mono">{project}</span>
        {explorer && !queued && (
          <>
            {' '}
            (
            <a href={`${explorer.url}/address/${project}`} target="_blank" rel="noopener">
              {explorer.name}
            </a>
            )
          </>
        )}
        .{queued && ' It shows on this page once it exists.'}
      </Callout>
      {editor && <LinkToListing project={project} name={name} editor={editor} />}
      {/* The one way on from here. A queued project has no page until the Safe's signers approve it. */}
      <Card title="What's next" help={CREATE_HELP.next} subtitle={queued ? 'Once the Safe’s other signers approve it, from the project’s page.' : undefined}>
        <ol className="mg-steps">
          <li>{editor ? 'Put it on a listing (above). You can also do it later from the project’s page.' : 'Put it on a listing in the editor, so investors can find it.'}</li>
          <li>Give a wallet the Manager role, under Settings & team. Approving investors needs it.</li>
          <li>Approve investors as their subscription documents come in.</li>
        </ol>
        <div className="mg-row-wrap mg-create-foot">
          {!queued && (
            <a className="mg-btn" href={`#${project}`}>
              Continue to the project
            </a>
          )}
          <a className={queued ? 'mg-btn' : 'mg-link'} href="#">
            All projects
          </a>
        </div>
      </Card>
    </div>
  );
}

/**
 * Putting a project on a listing, in the editor: a new listing with the name
 * and address filled in from the link, or one of the listings with no project
 * yet. An existing entry can't be filled from a link, so that button copies
 * the address for pasting.
 */
export function LinkToListing({ project, name, editor }: { project: Address; name: string; editor: Editor }) {
  const [slug, setSlug] = useState(editor.listings[0]?.slug ?? '');
  const pickId = useId();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(project).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  // The editor fills a new listing's fields from the link (Sveltia 0.258+ reaches into the
  // Investment group too). An existing listing can't be, so its button copies the address.
  const newUrl = `${editor.url}#/collections/listings/new?${name.trim() ? `title=${encodeURIComponent(name.trim())}&` : ''}investment.project=${project}`;
  return (
    <Card title="Put it on a listing" help={CREATE_HELP.listing} subtitle="Investors invest from a listing's page. Until one links to this project, only /manage/ shows it.">
      <div className="mg-form">
        <Field label="Project address" hint={copied ? 'Copied. Paste it in the editor.' : 'A new listing gets it filled in. An existing one takes it under Investment → Project contract address.'}>
          {(id, d) => (
            <div className="mg-inline">
              <input id={id} aria-describedby={d} className="mg-input mg-mono" readOnly value={project} onFocus={(e) => e.target.select()} />
              <TipButton className="mg-btn mg-quiet" tip={DO.copy} onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </TipButton>
            </div>
          )}
        </Field>
        <ol className="mg-steps">
          <li>New listing in the editor starts one with this project's name and address filled in.</li>
          <li>Or open an existing listing: the address is copied as it opens. Paste it under Investment → Project contract address.</li>
          <li>Add photos and text, then publish. The investment panel appears on the listing once the site has rebuilt, about two minutes later.</li>
        </ol>
        <div className="mg-row-wrap">
          <a className="mg-btn" href={newUrl} target="_blank" rel="noopener">
            New listing in the editor
          </a>
          {editor.listings.length > 0 && (
            <span className="mg-row-wrap">
              <label className="mg-sr" htmlFor={pickId}>
                Existing listing
              </label>
              <select id={pickId} className="mg-input mg-narrow" value={slug} onChange={(e) => setSlug(e.target.value)}>
                {editor.listings.map((l) => (
                  <option key={l.slug} value={l.slug}>
                    {l.title}
                  </option>
                ))}
              </select>
              <a className="mg-btn mg-quiet" href={`${editor.url}#/collections/listings/entries/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" onClick={copy}>
                Open that listing
              </a>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

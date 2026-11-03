# Wallet connect plan

Updated Nov 2, 2026 · branch `develop` · nothing built yet

This plan adds wallet connection to client sites so investors can put money
into a listing's on-chain project, and so the people who run a project can
manage it from the same site. It covers what each contract role needs to see
and do, how a listing connects to its contract, the ABI review, and the UI/UX
review. Questions still open are at the end.

Sources: `AllThingsLemon/real-estate-fund` `develop` @ `b78e557` (factory
version 4, `contracts/abi/`, the `ui/` test console, `CLAUDE.md`,
`docs/CONTRACT_FIXES_NEEDED.md`) and `AllThingsLemon/loans-dapp` (wallet setup).
Version 4 is version 3 without `reassignDeposit`, so deposits can't be moved
to another wallet.

## Decisions so far

| Question | Decision |
|---|---|
| Wallets | Same as loans-dapp: RainbowKit 2 + wagmi 2 + viem, with the injected, MetaMask, WalletConnect and Rainbow wallets |
| Investor approval | A request flow: the investor asks on the listing page, the Manager approves on the manage page |
| Backend | None for now. Come back to it only where it's truly needed (see [Without a backend](#without-a-backend)) |
| Creating projects | Keep using the console or scripts, then paste the project address into the listing in the CMS. The site checks the link |

## How a listing connects to its contract

Each listing is one real estate project. On-chain, each project is its own
`Project` contract (an EIP-1167 clone made by `ProjectFactory`). The listing
stores the contract's address, and everything else is read live from the chain.

```
client repo                         engine page                         BSC
content/listings/acme-tower.md      /projects/acme-tower/               Project 0xABC…
  investment:                         static: text, images, FAQ           config, buckets,
    project: "0xABC…"   ───────────▶  live island: raised / cap,  ◀────▶  deposits, roles,
                                      status, invest, your position       allowlist
site.config.json
  fund: { chainId, factories,
          trustedOwners, … }  ──────▶ used to check the address before any money moves
```

**Deposits are already tracked per project; the contract needs no change.**
Because every listing has its own contract, a deposit made on a listing's page
goes to that project only. Each project keeps its own raise cap, investor
allowlist, ledger, reserves and repayment queue. Every deposit is stored as a
`Deposit` record (investor, US or Global class, rate fixed at deposit time,
principal, USDT received, start, maturity, cycles paid, renewed, repaid) and
emits `DepositRecorded`. Points the site has to make clear:

- **Approval is per project.** An investor approved for one project isn't
  approved for the next. The request flow runs once per project.
- **No early withdrawal.** Principal comes back only through `payoffNext`,
  oldest deposit first, when the payoff pool can cover a deposit's whole
  principal. This can happen before maturity. At maturity the company must
  repay or renew the deposit.
- **A deposit takes only what fits.** `deposit(amount)` takes
  `min(amount, cap remaining)`. The amount must be at least `minDeposit`,
  unless it's the last deposit that fills the cap.
- **Wire investors** get their position through Operations
  (`creditedDeposit`). It shows up in their wallet's positions without them
  sending a transaction.

### Checking the link before any money moves

The factory is permissionless: anyone can create a project, give it any name,
and point its `metadataURI` at any listing. A CMS editor could also paste a
wrong address. So before the page shows a deposit button, it checks with
contract calls only:

1. `project.factory()` is one of the factories in `site.config.json`
   (`fund.factories`, only the versions you trust; see
   [Configuration](#configuration)).
2. `factory.isProject(project)` is true, so no impostor contract.
3. `project.owner()` is one of `fund.trustedOwners` in `site.config.json`.

If any check fails, the listing shows "Investing isn't available for this
listing" and no wallet actions. `site.config.json` is site-manager only and
not in the CMS, so a client editor can't change the trusted list.

When creating a project, set `metadataURI` to the listing's URL. The site
can't read it back without event logs, but it helps anyone looking at the
contract on BscScan.

## Roles: what each wallet sees

A wallet can hold several roles. The owner starts with OWNER and ADMIN. The
site works out who the connected wallet is with contract calls only:
`hasRole` for each role, `owner()`, `pendingOwner()`, `companyWallet()`,
`mgmtFeeWallet()`, `investorClass(wallet)`, and a scan of the project's
deposits. The UI hides what a wallet can't use, but **the contract enforces
every permission**. Hiding is for clarity, not security.

| Who | How the site knows | Where | What they need |
|---|---|---|---|
| Visitor, no wallet | — | Listing | Live raise progress, rates, term, minimum, status, payment health. "Connect wallet to invest" |
| Connected, not approved | `investorClass == None` | Listing | "Request access" form. Status if they already asked |
| Approved investor (US or Global) | `investorClass == US / Global` | Listing | Invest form with their class and rate |
| Investor with positions | deposits where `investor == wallet` | Listing, `/portfolio/` | Each position's principal, rate, interest received, next payment, maturity, queue place, status. "Collect interest due" when owed |
| MANAGER | `hasRole(MANAGER_ROLE)` | `/manage/` → Investors, Earnings | Approve, change or revoke investors. Split earnings. Send development funds to the company. Run LEMX compounding |
| ADMIN | `hasRole(ADMIN_ROLE)` | `/manage/` → Controls | Stop or resume deposits, pause, close the raise, propose new company or fee wallets |
| OWNER | `owner() == wallet` | `/manage/` → Access | Grant and revoke roles, transfer ownership |
| OPERATIONS | `hasRole(OPERATIONS_ROLE)` | `/manage/` → Money in | Record a wire investment (`creditedDeposit`). Property income to the payoff pool, tagged Operations |
| COMPANY | `hasRole(COMPANY_ROLE)` | `/manage/` → Money in | Renew a deposit (pays the investor the renewal fee) |
| Company wallet | `companyWallet() == wallet` | `/manage/` banner | Receives development funds. Accepts a proposed replacement |
| Management fee wallet | `mgmtFeeWallet() == wallet` | `/manage/` banner | Receives management fees. Accepts a proposed replacement |
| Pending owner | `pendingOwner() == wallet` | `/manage/` banner | Accept ownership |
| Anyone (keeper) | — | `/manage/` → Maintenance | The permissionless upkeep calls (below) |

The COMPANY role and the company wallet are different things. The role can
renew deposits. The wallet is just where development money is sent.

### Investor

- **Invest:** `deposit(amount)`, after an exact `approve` of the amount that
  will be taken. Blocked while paused, deposits are stopped, or the raise is
  closed or full.
- **Your position**, per deposit, all from `getDeposit`, `cyclesDue`,
  `cyclesOwed` and the Lens:
  - Interest received = `cyclesPaid × principal × rate / 1e8`. It's exact,
    because cycles are only ever paid whole at the rate fixed at deposit.
  - Interest owed now: `lens.interestOwed(project, id)`
  - Next payment date = `start + (cyclesDue + 1) × cycleDuration`
  - Queue place = `id − nextPayoffId` deposits ahead, plus the payoff pool
    balance against the principal ahead
  - Status: current, waiting on the reserve, matured, renewed, repaid
- **Collect interest due:** `payDue(id, 1)` is permissionless, so an investor
  can trigger their own payment when it's owed. If an older deposit is
  waiting, the call reverts with `OlderPaymentWaiting`, and the page explains
  that payments go oldest first.
- **`/portfolio/`:** the same position cards for every on-chain listing on
  this site.

### MANAGER (manage page: Investors, Earnings)

- **Investors:** `setInvestor(wallet, US | Global | None, referrer)`. A request
  link opens this form already filled in (see
  [Without a backend](#without-a-backend)). A class change applies to future
  deposits only, and the form says so.
- **Split earnings:** `split(repay, dev, compound)`. Show the net earnings
  available. A preview runs `simulateContract` first: it pays every due cycle
  before splitting and refuses with `PaymentsLate` if it can't.
- **Development funds:** `withdrawDev(amount)` sends to the company wallet.
  Shown disabled, with the reason, while paused, while payments are late, or
  while fees are deferred.
- **Compounding:** `startCompound` (shows the floor price and the 24 hourly
  slices), `escalateFloor` (uncapped by design, so confirm it),
  `cancelCompound`, and `finalizeCompound` once every slice has filled.

### ADMIN (manage page: Controls)

- **Stop / resume deposits:** `kill` / `cancelKill`. Only investor deposits
  stop. Reversible any time.
- **Pause / unpause:** blocks deposits and development withdrawals only.
  Investor payments keep running.
- **Close the raise:** `closeProject`. Permanent, so confirm by typing the
  project name.
- **Propose a new company wallet or fee wallet.** The current wallet has to
  accept, and the page shows that it's pending.

### OWNER (manage page: Access)

- **Roles:** `grantRole` / `revokeRole` for ADMIN, MANAGER, OPERATIONS and
  COMPANY. Without events the site can't list every holder, so
  `site.config.json` names the team's wallets (`fund.team`) and the page
  checks each one live with `hasRole`. There's also a "check any address" box.
- **Transfer ownership:** `transferOwnership(new)`, then the new owner accepts.
  Sending `address(0)` cancels a pending transfer. The page warns that the old
  owner loses **every** role when the new owner accepts.
- **No deposit recovery.** Version 3's `reassignDeposit` was removed in
  version 4, so the owner can't move a position, including for an investor
  who lost their key (see
  [Contract behaviour the UI must explain](#contract-behaviour-the-ui-must-explain)).

### OPERATIONS and COMPANY (manage page: Money in)

- **Record a wire investment:** `creditedDeposit(investor, credit, usdt)`.
  Shows the premium cap (`credit ≤ usdt × (1 + maxCreditPremiumBps)`) and the
  room left in the raise.
- **Renew a deposit (COMPANY):** `renew(id)`. Lists matured and soon-to-mature
  deposits, shows the fee (`principal × renewalFeeRate`) and the new maturity,
  and approves the fee first. Refused while that deposit's interest isn't
  current.
- **Permissionless money in**, listed here because the company is the one who
  uses them: `inject` (tops up the reserves, rest to net earnings), `fund`
  (any bucket) and `depositPayoff` (repayment money).

### Anyone (manage page: Maintenance)

A checklist built from state, showing only what needs doing now:

| Shows when | Action |
|---|---|
| `lens.dueDeposits` isn't empty | Pay due interest: `payDue(from, count)` |
| Payments late (`lens.backlog` late flag) | "Investors are owed X. Add money with Inject." |
| `undeployedPrincipal` is at least the pool minimum | Deploy principal: `deployPrincipal` |
| `pool.previewPendingEarnings(project) > 0` | Collect pool earnings: `sweep` |
| Payoff pool covers the next deposit in line | Repay next deposit: `payoffNext` |
| `lens.overdueBalloons` isn't empty | Matured deposits: renew or fund the payoff pool |
| Compound in flight and every slice filled | Finish compounding: `finalizeCompound` |
| Unlocked LP principal | `requestMaturedPrincipal`, then `claimLpWithdrawal(id)` |

`deployPrincipal`, `sweep`, `claimLpWithdrawal`, `startCompound`,
`finalizeCompound`, `cancelCompound` and `depositHeldLemx` can need a BNB fee
for the pool (see [ABI review](#abi-review)). Investors never do: `deposit`
isn't payable, so they only need BNB for gas.

## Pages

| Route | Who | Notes |
|---|---|---|
| `/<listingsPath>/<slug>/` | Everyone | The existing static page plus a live invest panel in the side column. On phones it sits after the summary, with a sticky "Invest" bar |
| `/portfolio/` | Investors | Positions across this site's listings. `noindex` |
| `/manage/` | Role holders | Project picker (only projects where the wallet holds a role, or has a pending handover), then tabs. `noindex` |

**Not `/admin/`.** That path is the Sveltia CMS. `/manage/` and `/portfolio/`
are only built when the client's `site.config.json` has a `fund` block. Other
clients' sites don't change.

Manage tabs: **Overview** (health and the Maintenance checklist) ·
**Investors** · **Earnings** · **Money in** · **Controls** · **Access**. A tab
only shows if the wallet can use it. Overview always shows.

## Wallet integration (same as loans-dapp)

- **Libraries:** `@rainbow-me/rainbowkit` 2, `wagmi` 2, `viem` 2,
  `@tanstack/react-query` 5, and `@astrojs/react` for the islands. Wallets via
  `connectorsForWallets`: `injectedWallet`, `metaMaskWallet`,
  `walletConnectWallet`, `rainbowWallet`, as in loans-dapp
  `src/config/wagmi.ts`. `appName` is the client's `siteName`.
- **WalletConnect project ID:** from `site.config.json` (`fund.walletConnectProjectId`).
  It's public. Each client domain and its preview domain must be on the
  project's allowlist in the Reown dashboard.
- **Chains:** `bsc` (56) and `bscTestnet` (97), copied from loans-dapp with
  `multicall3` at `0xca11bde05977b3631167028862be2a173976ca11`. Port
  `src/config/rpc.ts`, `transport.ts` and `stickyFallback.ts`: Binance
  dataseeds in order, 4 s per endpoint. loans-dapp found these are the only
  endpoints that reliably answer browsers. Its `/api/rpc` proxy is a Worker,
  so it waits for a backend.
- **One island per page.** One React root (`client:only="react"`) per page
  holds `WagmiProvider` + `RainbowKitProvider` and portals the connect button
  into a header slot. That means one modal and one connection state, not
  separate islands that disagree. The wallet code only loads on pages that
  need it (on-chain listings, `/portfolio/`, `/manage/`). The listing text
  stays static, so it still loads fast and is indexed.
- **Theme:** RainbowKit `lightTheme` with `accentColor` = the client's
  `theme.accent`, and dark or light text on it by contrast (the default accent
  is yellow `#facc15`, so dark text). Island components use the engine's CSS
  variables (`--accent`, `--surface`, `--border`, `--radius`), with no
  Tailwind, to match the rest of the engine.
- **Typed ABIs:** `@wagmi/cli generate` from the copied ABI JSON, as in
  loans-dapp's build, so calls are type-checked. The console casts to `Abi`
  and `any` throughout.

## Without a backend

With no backend, the site can only read the chain with contract calls. I
checked on Nov 2: the Binance dataseeds (mainnet and testnet) answer every
`eth_getLogs` with `limit exceeded`, even for one block. publicnode serves logs
only with an address filter and up to 50k blocks, and loans-dapp found it
refuses browser requests from production sites. So **nothing important can
depend on event logs.** A transaction receipt still carries its own logs, so
after a deposit the site can show the new deposit number without
`eth_getLogs`.

| Feature | Without a backend | What's missing |
|---|---|---|
| Live project data | Lens `getProjectState`, `config()`, batched through multicall | Nothing |
| Your positions | Read every deposit (`depositCount` is at most about raiseCap ÷ minDeposit) and keep yours. A few batched requests | Nothing |
| Interest received | `cyclesPaid × interest per cycle` | Per-payment dates and transaction links |
| Your roles | `hasRole` and the wallet getters | Nothing |
| Everyone holding a role | `fund.team` wallets checked live | Holders not listed in the config |
| Investor list | Wallets with deposits, from the scan | Approved wallets that haven't invested yet |
| Request queue | The request is emailed (below) | A list of requests in the manage page |
| Interest payments | Investors' "Collect interest due" and the Maintenance checklist | **Nothing pays on schedule.** Interest only moves when someone calls `payDue` |
| Deposit moved away | Nothing. The old wallet just stops seeing it | An alert to the investor |

**The request flow without a backend.** On the listing, "Request access" asks
for name, email and US or Global. It sends an email (a `mailto:` link, or a
hosted form if you prefer one; see the questions below) containing the wallet,
the project, and a link:

```
https://client-site/manage/?project=0xABC…&approve=0xINVESTOR&class=US
```

The Manager checks the investor's documents, clicks the link, and the
Investors tab opens with the approval filled in: one transaction. The
Manager's inbox is the queue. The listing tells the investor what happens next
and shows "Approved" once the class is set on-chain.

**First things a backend would add**, in order: a scheduled keeper that calls
`payDue` and `sweep` every cycle (only gas, no roles needed); the request
queue in a database; event history (payment dates, role holders, alerts when
payments go late or roles change).

## Configuration

`site.config.json` (site manager only, not in the CMS):

```json
{
  "fund": {
    "chainId": 97,
    "factories": ["0x3f5B41bef4fbd61b85dC66B1DF2A29d876579ea8"],
    "lens": "0x35Af18594812BB238fE3d280277fE27840bB63D7",
    "trustedOwners": ["0x…"],
    "team": [{ "label": "Ops desk", "wallet": "0x…" }],
    "walletConnectProjectId": "…",
    "requestEmail": "invest@client.com"
  }
}
```

These are the v4 sandbox factory and lens (deploy block 140480647). List only
v4 or later in `factories`. A project keeps its factory's code forever, so v3
projects still have `reassignDeposit`, and v1 and v2 projects still have the
`withdrawDev` bug.

No `fund` block means no wallet code, no `/manage/` and no `/portfolio/`. That
keeps the change backwards compatible for every client, as the README's rules
require.

Listing (CMS and `src/content.config.ts`, optional, added together):

```ts
investment: z.object({
  project: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
}).default({}),
```

In the CMS it's a collapsed "Investment" group with one field: "Project
contract address". Its hint says to get the address from the site manager.

## ABI review

Reviewed `contracts/abi/` on `develop` (generated Nov 3, 00:51 UTC, with the
v4 sandbox deploy).

- **The ABI matches the source.** I checked every public or external function,
  public variable and custom error in `Project.sol` against `Project.json`. No
  differences: 35 write functions (including the factory-only `initialize`),
  61 views, 43 events, 31 errors. Factory: 1
  write (`createProject`), 14 views. Lens: 6 views. Compared with v3, only
  `reassignDeposit` and `DepositReassigned` are gone. The factory and Lens
  ABIs are unchanged.
- **`main` is behind.** `main` still has the v2 contract, without the
  `withdrawDev` fix, and its `MANIFEST.json` points at the v2 factory. Copy
  from `develop`, or merge `develop` → `main` first.
- **Copy the ABIs into the engine.** The engine is public and the fund repo is
  private, so Cloudflare builds can't fetch from it. Add `src/fund/abi/` with
  `Project`, `ProjectFactory`, `ProjectLens` and `MANIFEST.json`, plus a sync
  script that records the source commit. The ABIs are public on BscScan
  anyway.
- **No list of an investor's deposits or of role holders on-chain.** Both need
  events, which the site can't read without a backend. The deposit scan covers
  positions. The Lens is stateless and can be redeployed without touching any
  project, so a `LensV2` with `depositsOf(project, investor)` and
  `accountView(project, account)` (roles, class, wallet matches in one call) is
  an option if multicall turns out too slow. `Project` itself has about
  0.4 KiB left (23.590 of 24 KiB), so contract changes are very limited.
- **The project name and `metadataURI` are only in the factory's
  `ProjectCreated` event,** not readable from the project. The site uses the
  CMS title.
- **Native fees for pool calls aren't in this ABI set.** The real Loans pool
  prices its BNB fee in USD (`depositFeeUSD`, `withdrawFeeUSD`) through
  `PriceHelper.getNativeFee(nativeGasToken, feeUSD)`. Only the sandbox mock's
  `nativeFee()` is exported here. Quoting fees for the payable upkeep calls
  needs the `LiquidityPool` and `PriceHelper` ABIs, which loans-dapp already
  has in `src/abis/`.
- **Decimals differ by network:** BSC USDT 18, testnet LUSD 8, sandbox 18.
  Always read `decimals()` from the token.
- **Errors need plain-English messages.** `MissingRole` carries the role hash,
  so map it to a name. All 31 errors need a message (draft list under
  [UI/UX review](#uiux-review)). Token reverts come back empty (stripped
  revert strings), so check allowance and balance before simulating, instead
  of reading an empty revert as "needs approval" the way the console does.
- **Pad gas estimates by 30%.** The console found public-RPC `estimateGas`
  about 1% short on sandbox calls (out of gas otherwise).
- **Enums by number:** `Class` 0 None, 1 US, 2 Global. `Bucket` 0 interest
  reserve … 6 undeployed principal. Rates use 1e8 = 100% per 30-day cycle;
  only `compoundSlippageBps` and `maxCreditPremiumBps` are in bps.
- **Deployments:** `MANIFEST.json` has only `bscTestnetSandbox`. There's no
  live-testnet-pool or mainnet factory yet.

## Contract behaviour the UI must explain

None of these are bugs, but each needs clear words on the page.

1. **Interest isn't automatic.** It's paid each cycle only when someone calls
   `payDue`, or `split` or `withdrawDev`, which pay everything due first. With
   no keeper, investors see "owed" grow until someone acts.
2. **Your money is locked until repaid.** No early exit. Repayment is oldest
   deposit first, from the payoff pool.
3. **Three ways deposits stop:** paused (temporary; development withdrawals
   stop too), deposits stopped (`kill`, reversible), and closed (permanent).
   Each needs its own wording.
4. **Replacing a wallet needs the current wallet.** `acceptCompanyWallet` and
   `acceptMgmtFeeWallet` must come from the wallet being replaced, so a lost
   company or fee wallet key can't be rotated. Worth raising with the contract
   team.
5. **A deposit stays with the wallet that made it.** Version 4 has no way to
   move a position. If an investor loses their key, nobody can recover the
   position, and investors can't change their payout wallet. The invest panel
   says so before a first deposit and suggests a multisig: a Safe works as an
   investor wallet, connected through WalletConnect.
6. **Rates are per 30-day cycle,** e.g. 2% per cycle. How to show it is an
   open question.

## UI/UX review

### What not to carry over from the console

The `ui/` console is a tester's tool, and good at that, but it's the wrong
model for investors and operators:

- Every function is enabled for every wallet on purpose (so testers can see
  permission errors). Production should show each wallet only what it can
  use, and explain disabled buttons.
- Function names and raw units (`payDue(fromId, count)`, bps, seconds, enum
  numbers) instead of tasks in plain words.
- One page holding all 36 actions in `<details>` groups.
- Every 12 s it re-reads everything (about 15 reads plus 4 per deposit), and
  only the first 200 deposits. Refresh after the wallet's own transactions,
  with a slower background poll, and read every deposit.
- Hash routing and a faucet in the header. Sandbox tools stay in the console.

### Principles for the production pages

- **One clear next step.** The invest button changes with state: Connect
  wallet → Switch to BNB Chain → Request access → (waiting for approval) →
  enter amount → Approve USDT → Invest → done, with the deposit number,
  maturity and a BscScan link.
- **Check before signing.** Run `simulateContract` before every transaction
  and translate errors before the wallet opens. Never send an `approve` for a
  call that would be refused anyway (console issue fixed in PR #2).
- **Approve the exact amount,** never unlimited: the amount that will actually
  be taken, `min(amount, cap remaining)`.
- **Say what will happen:** "You'll invest 9,500 USDT. Only 9,500 is left in
  this raise."
- **Plain words** (glossary below), full numbers with thousands separators,
  never raw wei, short addresses with copy and BscScan buttons.
- **Honest health:** "Payments up to date" or "Payments late since deposit
  #12", and "Interest cover: 2.0 months" (interest reserve ÷ monthly interest
  owed; the target is 2).
- **Confirm what can't be undone:** close the raise (type the name), transfer
  ownership, revoke your own role, lower the compound floor.
- **Transaction status** in an `aria-live` toast: waiting for wallet →
  submitted (link) → confirmed or failed with the plain-English reason. A
  pending transaction survives a page reload.
- **Mobile first on the listing and portfolio pages** (WalletConnect deep
  links, 16 px gutters, sticky invest bar). The manage page can be
  desktop-first but must still work on a phone.
- **Live numbers replace typed ones.** When a listing is linked, show raised,
  cap and rates from the chain, and stop relying on hand-typed "Raised"
  figures that drift.

### Glossary: contract term → page wording

| Contract | On the page |
|---|---|
| `investorClass` US / Global | Investor type: US / International |
| `kill` / `killed` | Stop deposits / Deposits stopped |
| `paused` | Paused |
| `closed` / `filled` | Raise closed / Fully funded |
| interest reserve vs target | Interest cover (months) |
| `blockedFrom` set | Payments late |
| `payoffPool` | Repayment fund |
| `payoffNext`, FIFO head | Repay next investor / Your place in line |
| `netEarnings` | Earnings available to split |
| `devBalance` / `withdrawDev` | Development funds / Send to company |
| `compoundPending`, `startCompound` | Set aside for LEMX / Buy LEMX |
| `inject` | Add money to cover payments |
| `creditedDeposit` | Record a wire investment |
| `sweep` | Collect pool earnings |

### Error messages (draft, investor-facing first)

| Error | Message |
|---|---|
| `NotApprovedInvestor` | This wallet isn't approved for this project yet. |
| `ProjectIsKilled` | Deposits are stopped for this project right now. |
| `ProjectPaused` | This project is paused. Deposits will reopen when it resumes. |
| `ProjectNotOpen` | This raise is closed or fully funded. |
| `BelowMinimumDeposit` | The minimum investment is {minDeposit} USDT. |
| `OlderPaymentWaiting(id)` | Payments go oldest first, and deposit #{id} is still waiting. |
| `PaymentsLate` | Investors are owed interest. Bring payments up to date first. |
| `MissingRole(role)` | This wallet doesn't have the {role} role on this project. |
| `InterestNotCurrent(id)` | Deposit #{id} has interest owed. Pay it first. |
| `InsufficientPayoffPool(need, have)` | The repayment fund has {have} of the {need} USDT needed. |

The other 21 follow the same pattern.

## Build phases

All work on `develop`. Engine `main` is live for every client on their next
save, and the Deploy all clients Action rebuilds every site when `main`
changes. Merge only once the build check passes and a client without `fund`
builds exactly as before.

1. **Foundations.** The `fund` config in `client-dir.mjs`, the listing
   `investment` field (schema + CMS together), copied ABIs + `@wagmi/cli`,
   chains and transport ported from loans-dapp, and the island shell with the
   connect button. *Done when* a sandbox-linked listing shows Connect wallet
   and a site without `fund` is byte-identical.
2. **Live listing.** Link checks, raise progress, status, rates, interest
   cover, payments health. No wallet needed. *Done when* the numbers match the
   console for the same project.
3. **Investors.** Request access (email + prefilled manage link), approve +
   invest with simulation, position cards, collect interest due,
   `/portfolio/`.
4. **Manage: Manager, Admin, Owner.** Project picker, Overview + Maintenance,
   Investors (with the prefilled approval), Earnings, Controls, Access.
5. **Manage: Money in and fees.** Operations, Company, inject, fund, payoff,
   and native fee quotes for the payable upkeep calls.
6. **QA.** Walk `docs/TESTING.md` in real-estate-fund against the v4 sandbox
   through the new pages (Claude in Chrome + MetaMask), WalletConnect on a
   phone, keyboard and screen reader checks, and a stage client site.

## Open questions

1. **Contract source:** will real-estate-fund `develop` (v4) be merged to
   `main` before we copy the ABIs, or should we copy from `develop`?
2. **Network and timing:** testnet sandbox first, then a factory on the live
   testnet pool, then mainnet? Which network should the first client go live
   on?
3. **Multisig owner:** will the owner be a Safe before mainnet? The owner can
   still grant itself every role, so one key runs the whole project. If so,
   owner and admin actions become Safe proposals over
   WalletConnect, with no immediate receipt, and the manage page needs a
   "sent to your Safe" state. Plan for it now?
4. **Request email:** a plain `mailto:` link (no services, but depends on the
   investor's mail app) or a hosted form (Tally, Formspree, Google Forms)?
   Who receives it per client?
5. **Rate wording:** "2% per month", "24% a year (simple)", or both?
6. **Legal copy:** terms to accept before a first deposit, risk notice,
   US/International self-declaration, any country restrictions. Who provides
   the text?
7. **Interest payments:** with no keeper, who calls `payDue` each cycle, and
   is it acceptable that payments wait until someone does? This is the
   strongest case for the first piece of backend.
8. **Portfolio scope:** only this site's listings, or every project the wallet
   has invested in? The second needs event history.
9. **Team list:** OK to list each client's team wallets in `site.config.json`
   so the Access tab can show who holds which role?
10. **WalletConnect project:** reuse loans-dapp's Reown project and add every
    client domain, or one project per client?
11. **Wallet branding:** confirm the connect dialog shows the client's name
    and accent colour, not Lemon's.

# Wallet connect plan

Updated Nov 3, 2026 · branch `develop` · phases 1 to 4 built

This plan adds wallet connection to client sites so investors can put money
into a listing's on-chain project, and so the people who run a project can
manage it from the same site. It covers what each contract role needs to see
and do, how a listing connects to its contract, the ABI review, and the UI/UX
review. Questions still open are at the end.

Sources: `AllThingsLemon/real-estate-fund` `develop` @ `af38f11` (factory
version 5, `contracts/abi/`, the `ui/` test console, `CLAUDE.md`,
`docs/CONTRACT_FIXES_NEEDED.md`) and `AllThingsLemon/loans-dapp` (wallet setup).
Version 4 removed `reassignDeposit`, so deposits can't be moved to another
wallet. Version 5 changed how interest is paid: `payDue` now sweeps deposits in
order from `payCursor`, and splits and development withdrawals wait until a
sweep has brought every deposit up to date.

## Decisions so far

| Question | Decision |
|---|---|
| Wallets | Same as loans-dapp: RainbowKit 2 + wagmi 2 + viem, with the injected, MetaMask, WalletConnect and Rainbow wallets |
| Investor approval | Handled off the site, with no email: the investor's wallet address comes in with their subscription documents, and the Manager approves it on the manage page. A request button on the site would need a backend |
| Backend | None for now. Come back to it only where it's truly needed (see [Without a backend](#without-a-backend)) |
| Creating projects | Keep using the console or scripts, then paste the project address into the listing in the CMS. The site checks the link |
| Contract source | The contract is still changing, so copy the ABIs from real-estate-fund `develop`, pinned to a commit by the sync script. Switch to `main` once it lands there |
| Network | BSC testnet (chain 97), on the sandbox factory. Test tokens only, so every wallet page shows a test network banner |
| Multisig owner | Plan for a Safe as owner now (see [Safe owners](#safe-owners)) |
| Interest payments | The Manager calls `payDue`, with a "Pay all interest due" button (see [MANAGER](#manager-manage-page-investors-earnings)) |
| Portfolio | Only the listings on the site the investor is on. Never mix clients |
| Role holders | Never listed. Each wallet sees only its own roles |
| WalletConnect | Reuse loans-dapp's Reown project ID |
| Connect dialog | The standard RainbowKit flow, showing the client's name, icon and accent colour |
| Rates | Shown per cycle ("2% per cycle"), with the cycle length beside it ("1 cycle = 30 days"). No monthly or yearly conversions |
| PPM and disclosures | Counsel writes each PPM and reviews the site's disclosure text against it. The text is in the client's "Investor disclosures" settings file. [SAMPLE_DISCLOSURES.md](SAMPLE_DISCLOSURES.md) is a starting point for counsel |

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
  approved for the next. The Manager approves a wallet once per project.
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
| Connected, not approved | `investorClass == None` | Listing | "Not approved for this project yet", their wallet address with a copy button, and how approval works |
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
  closed or full. Every deposit shows the short confirmation from
  [SAMPLE_DISCLOSURES.md](SAMPLE_DISCLOSURES.md) above the button.
- **Your position**, per deposit, all from `getDeposit`, `cyclesOwed` and the
  Lens:
  - Interest received = `cyclesPaid × principal × rate / 1e8`. It's exact,
    because cycles are only ever paid whole at the rate fixed at deposit.
  - Interest owed now: `lens.interestOwed(project, id)`
  - Next payment date = `start + (cyclesPaid + cyclesOwed + 1) × cycleDuration`
  - Queue place = `id − nextPayoffId` deposits ahead, plus the payoff pool
    balance against the principal ahead
  - Status: current, waiting on the reserve, matured, renewed, repaid
- **Collect interest due:** `payDue` is permissionless, but it can't start
  past `min(blockedFrom, payCursor)`, so the investor's button sends
  `payDue(from, id − from + 1)` with `from` the lower of that and the deposit's
  own number. That pays every older deposit's due interest too, so it costs
  more gas when the Manager hasn't paid in a while, and the page says how many
  older deposits it pays. The sweep stops at the first deposit the interest
  reserve (topped up from net earnings) can't cover, so the page adds up the
  interest owed from `from` to the deposit first. If the reserve and net
  earnings can't cover it, the button is disabled, with both amounts.
- **`/portfolio/`:** the same position cards for every linked listing on this
  site, hidden listings included (without a link), with totals when there's
  more than one project.

### MANAGER (manage page: Investors, Earnings)

- **Investors:** `setInvestor(wallet, US | Global | None, referrer)`. The
  Manager pastes the wallet address from the investor's subscription
  documents and picks the investor type (see
  [Without a backend](#without-a-backend)). A class change applies to future
  deposits only, and the form says so.
- **Pay all interest due:** `payDue(payCursor, batch)` pays every due cycle,
  oldest deposit first, and stops at the first deposit the reserve can't
  cover. When a sweep reaches the last deposit, the contract records
  `nextDue`, and payments are up to date while `nextDue` is in the future.
  The button repeats it until then: one transaction for most projects,
  several when there are many deposits. The tab shows how much is due now,
  how many deposits it covers, and when `nextDue` falls. Nothing pays on its
  own, so the tab also offers a recurring calendar reminder (an `.ics` file
  made in the browser). `payDue` needs no role, so the Manager can send it
  from an everyday wallet even if the MANAGER role sits in a Safe.
- **Split earnings:** `split(repay, dev, compound)`. Show the net earnings
  available. It's refused with `PaymentsLate` while `nextDue` has passed, so
  until then the tab shows "Pay all interest due first" instead of the form.
- **Development funds:** `withdrawDev(amount)` sends to the company wallet.
  Shown disabled, with the reason, while paused, while `nextDue` has passed,
  or while fees are deferred.
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
  COMPANY. The site never lists who holds a role. The owner types an address
  to grant, revoke or check it, one at a time. (Roles are still public
  on-chain, as `RoleGranted` events, for anyone who indexes them.)
- **Transfer ownership:** `transferOwnership(new)`, then the new owner accepts.
  The new owner has to be in the site's `fund.trustedOwners` first, or the
  listing fails its link check once they accept.
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
| `nextDue` has passed | Pay all interest due (the Manager's job; anyone can send it) |
| Payments late (`lens.backlog` late flag, which follows `nextDue` in v5) and the reserve is short | "Investors are owed X. Add money with Inject." |
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
| `/<listingsPath>/<slug>/` | Everyone | The existing static page plus a live invest panel in the side column. On phones it sits after the summary, with a sticky "Invest" bar (phase 3). With the panel, the side column scrolls with the page instead of sticking, because it's taller than most windows |
| `/portfolio/` | Investors | Positions in this site's listings only, never another client's projects. `noindex` |
| `/manage/` | Role holders | Project picker (only this site's listings where the wallet holds a role, or has a pending handover), then tabs. `noindex`, and not linked in the navigation |

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
  `src/config/wagmi.ts`. The standard RainbowKit connect dialog, with the
  client's `siteName` as `appName` and the client's URL and icon in the
  WalletConnect metadata, so a phone wallet shows the client, not Lemon.
- **WalletConnect project ID:** the same Reown project as loans-dapp (the
  value loans-dapp sets as `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`), set in
  `site.config.json` (`fund.walletConnectProjectId`). It's public. Each client
  domain and its preview domain must be added to the project's domain
  allowlist in the Reown dashboard.
- **Chains:** `bscTestnet` (97) first, and `bsc` (56) later, copied from loans-dapp with
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
- **Typed ABIs:** `pnpm sync:fund-abi ../real-estate-fund` writes
  `src/fund/abi.ts` with every ABI `as const`, pinned to the fund commit it
  came from, so viem type-checks every call. That replaces `@wagmi/cli`,
  which would add TypeScript to every client's build. The console casts to
  `Abi` and `any` throughout.

### Safe owners

The owner, and any other role, can be a Safe multisig. A Safe transaction
doesn't confirm straight away: it waits until enough signers approve it.

- **Not on testnet.** The Safe{Wallet} app and its transaction service don't
  support BSC testnet. Safe's public config service has no chain 97 (checked
  Nov 2), but it does have BNB Chain (56). On testnet the owner stays a
  regular wallet.
- **Build the manage page to handle it anyway.** If the connected wallet is a
  contract (`getCode` isn't empty) or the WalletConnect peer is Safe, show
  "Sent to your Safe. The other signers need to approve it in Safe{Wallet}"
  instead of waiting for a receipt. Then refresh from chain state when it
  executes. Also add wagmi's `safe` connector, so on BSC mainnet the manage
  page can run inside Safe{Wallet} as a custom Safe App.
- **Before the first mainnet client,** test the full flow with a real Safe on
  BSC mainnet: grant a role, transfer ownership, close a raise.
- **Routine work doesn't need the Safe.** `payDue`, `sweep` and the other
  upkeep calls are permissionless, so an everyday wallet can send them.

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
| Everyone holding a role | Not shown, by choice. The owner checks one address at a time | Nothing needed |
| Investor list | Wallets with deposits, from the scan | Approved wallets that haven't invested yet |
| Request queue | None. Wallet addresses arrive with the subscription documents (below) | Requesting access from the site, and a list of requests in the manage page |
| Interest payments | The Manager's "Pay all interest due", plus investors' "Collect interest due" | **Nothing pays on schedule.** Interest only moves when someone calls `payDue`. A calendar reminder stands in for a keeper |

**How an investor gets approved, without a backend.** The site has no server
and sends no email, so it can't pass a request to anyone. Approval happens
through the offering's own paperwork:

1. The investor connects their wallet on the listing. The page says the
   wallet isn't approved for this project yet and shows its address with a
   copy button.
2. The investor includes that address in their subscription documents for
   the project.
3. The Manager checks the documents, pastes the address into the Investors
   tab, picks US or International, and approves: one transaction.
4. The listing shows "Approved" as soon as the class is set on-chain, and the
   invest form appears.

The site never collects names or contact details. A request button on the
site, with a list of requests in the manage page, needs a backend to store
them.

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
    "factories": ["0x8f2548d8d41394BA2c8Cc1bc364CD24EC2eA7FC1"],
    "lens": "0x2aa6717bfA3122dCeFdb91931cE48E946Ae816a2",
    "trustedOwners": ["0x…"],
    "walletConnectProjectId": "…"
  }
}
```

These are the v5 sandbox factory and lens (deploy block 140525489). List only
v5 or later in `factories`. A project keeps its factory's code forever, so v4
projects still loop over every deposit in `split` and `withdrawDev` (fixed in
v5), v3 projects still have `reassignDeposit`, and v1 and v2 projects still
have the `withdrawDev` bug.

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

**Disclosure text** lives in the client's own content repo, never in the
public engine: `content/settings/investing.json`, edited under Site settings
→ Investor disclosures (only on sites with a `fund` block). Counsel reviews it
against the project's PPM. Plain text with a blank line between paragraphs,
"- " for bullets and `**bold**`, never HTML. Placeholders filled on the page:
`{company}`, `{project}`, `{network}`, `{wallet}`, `{class}`, `{rate}`,
`{cycle}`, `{fee}`, `{amount}` and `{token}`. Investing stays off until the
acknowledgments and the deposit confirmation are filled in. The listing
notice and the test network banner are rendered when the site is built, so
they show without JavaScript. The footer line is the existing footer notice
box under Branding & layout.

## ABI review

Reviewed `contracts/abi/` on `develop` (v4 at `b78e557`, then v5 at
`af38f11`).

- **The ABI matches the source.** I checked every public or external function,
  public variable and custom error in v4's `Project.sol` against
  `Project.json`, with no differences. v5 has 35 write functions (including
  the factory-only `initialize`), 62 views, 43 events and 31 errors. Factory:
  1 write (`createProject`), 14 views. Lens: 6 views. Compared with v4, v5
  adds `nextDue` and `payCursor` and drops `cyclesDue` (due cycles are
  `cyclesPaid + cyclesOwed`). The factory and Lens function lists are
  unchanged.
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
  an option if multicall turns out too slow. `Project` itself is at 23.997
  of 24 KiB, so it can't take a change without losing something else.
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
  reserve … 6 undeployed principal. Rates use 1e8 = 100% per cycle;
  only `compoundSlippageBps` and `maxCreditPremiumBps` are in bps.
- **Deployments:** `MANIFEST.json` has only `bscTestnetSandbox`. There's no
  live-testnet-pool or mainnet factory yet.

## Contract behaviour the UI must explain

None of these are bugs, but each needs clear words on the page.

1. **Interest isn't automatic.** It's paid only when someone runs `payDue`,
   normally the Manager. Until then, investors see "owed" grow, and splits and
   development withdrawals are refused. Investors can use their own "Collect
   interest due" button, which also pays every older deposit first.
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
6. **Rates are per cycle.** Every percentage on the site says "per cycle"
   ("2% per cycle", "management fee 0.5% per cycle"), with the cycle length
   beside it, and is never converted to a month or a year. A cycle is 30 days
   in production but 5 minutes on the sandbox, so the page reads
   `cycleDuration` and never assumes 30 days. Interest is simple: each cycle
   pays the same amount on the principal.

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
  wallet → Switch network → Not approved yet (copy your address) →
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
  #12", and "Interest cover: 2.0 cycles" (interest reserve ÷ interest owed
  per cycle; the target is 2).
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
| `cycleDuration` | Cycle (shown with its length, e.g. "1 cycle = 30 days") |
| rates (1e8 = 100%) | X% per cycle |
| interest reserve vs target | Interest cover (cycles), with "Target 2 cycles" |
| `nextDue` in the future | Interest payments: Up to date, next due {date} |
| `nextDue` passed | Interest payments: Due, not yet paid |
| `blockedFrom` set | Interest payments: Late since deposit #{id} |
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

1. **Foundations. Built.** The `fund` config in `client-dir.mjs`, the listing
   `investment` field (schema + CMS together), ABIs copied by
   `sync:fund-abi`, chains and transport ported from loans-dapp, and the
   island shell with the connect button. Checked: a listing linked to a v5
   sandbox project shows Connect wallet (desktop and phone), and the template
   site without `fund` builds byte-identical to `main`.
2. **Live listing. Built.** The link check, then a panel with status, raised
   of cap, rates per cycle with the cycle length, term, minimum, interest
   payments, interest cover and the contract link. No wallet needed. It reads
   with multicall: the link check and the project's wiring once per page
   load, the state every 30 seconds. A failed link check shows "Investing
   isn't available for this listing", and the browser console says which
   check failed. Checked: the v5 sandbox project's numbers match the
   console's reads, each refusal (not a project, untrusted factory, untrusted
   owner) works, desktop and phone (320 px) layouts, a strict TypeScript check
   of `src/fund/`, and the template site still builds byte-identical to
   `main`.
3. **Investors. Built.** The test network banner and listing notice, the
   wallet's one next step (connect → not approved yet, with its address to
   copy → invest), the risk summary and acknowledgments before a first
   deposit in each project, the deposit confirmation, an exact approval then
   the deposit, position cards with "Collect interest due", `/portfolio/`
   (injected only on fund sites), a transaction toast that survives a reload,
   and a sticky Invest bar on phones. Every transaction switches network if
   needed, simulates first, pads gas by 30% and explains failures in plain
   words (all 31 errors). Tested on a local anvil fork of BSC testnet with a
   stand-in wallet in the browser: not approved, the amount checks, the
   acknowledgments, approve + invest (exact allowance, 0 left after),
   "Collect interest due" both blocked by an older deposit and paid, a
   cancelled request, a reload mid-transaction, `/portfolio/`, and phone
   layouts. The template site still builds byte-identical to `main`. Not yet
   tried with a real wallet (MetaMask, WalletConnect): that's phase 6.
4. **Manage: Manager, Admin, Owner. Built.**
   - `/manage/`, injected only on fund sites and not indexed.
   - **Project picker:** this site's projects where the wallet holds a role
     or a handover waits on it. Every other project is listed for upkeep
     only, because `payDue` and `payoffNext` need no role.
   - **Address-bar routing** (`#0x…/earnings`), and handover banners (accept
     ownership, accept a new company or fee wallet).
   - **Tabs, each shown only to the wallet that can use it:**
     - Overview: health, money buckets, Maintenance checklist.
     - Investors: approve, change or revoke a pasted wallet; the list of
       wallets with deposits.
     - Earnings: "Pay all interest due" in batches until `nextDue` is in the
       future, stopping with the shortfall at the first deposit the reserve
       can't cover; a calendar reminder; split; development funds.
     - Controls: stop or resume deposits, pause, close the raise by typing its
       name, propose wallets.
     - Access: check, grant or revoke one address at a time; ownership
       transfer behind a confirmation.
   - **Safe:** a contract wallet gets "Sent to your Safe…" instead of waiting
     for a receipt, and RainbowKit's Safe connector is added (it only shows
     inside Safe{Wallet}).
   - **Tested** on the anvil fork with a stand-in wallet: every tab's actions;
     payments short, then paid after an inject; both handovers; the Safe
     state from a contract address; the upkeep-only view; phone layouts.
   - **Found while testing:** a new owner must be in `fund.trustedOwners`
     before accepting, or the listing fails its link check. The transfer
     form now says so.
   - **Moved to phase 5, because they need BNB fee quotes:** the compounding
     actions (start, raise the floor, cancel, finalize) and the payable
     checklist items (`deployPrincipal`, `sweep`, LP withdrawals). The
     checklist lists the first two and points to the fund console for now.
5. **Manage: Money in and fees.** Operations, Company, inject, fund, payoff,
   native fee quotes for the payable upkeep calls, and the compounding
   actions. The checklist's "finish compounding" and unlocked LP principal
   items come with them.
6. **QA.** Walk `docs/TESTING.md` in real-estate-fund against the v5 sandbox
   through the new pages (Claude in Chrome + MetaMask), WalletConnect on a
   phone, keyboard and screen reader checks, and a stage client site. Before
   the first mainnet client, the Safe flow with a real Safe on BSC mainnet.

## Open questions

None right now. Every question so far is answered in
[Decisions so far](#decisions-so-far).

# End-to-end testing on BSC testnet

This plan tests a client site's wallet pages and the real-estate-fund
contracts behind them together, from start to finish, on the
**bscTestnet sandbox**: the listing's invest panel, `/portfolio/`, the
header's Manage link, and every page and action of `/manage/`, with every
transaction checked on the chain against the contract code.

It includes every case of the fund repo's dashboard test plan,
[`DASHBOARD_TESTING.md`](https://github.com/AllThingsLemon/real-estate-fund/blob/develop/docs/DASHBOARD_TESTING.md),
because `/manage/` follows that dashboard page for page. Its IDs (G, D1–D11)
are kept, so a result can be compared with the dashboard's, and the
[coverage table](#coverage-of-dashboard_testingmd) maps every dashboard case
to its case here. Contract behaviour the site drives but doesn't show
directly has its own section, [C](#c-contract-behaviour-through-the-site).

## How the contract is checked

The site is built on our reading of the contract, so a page that looks right
proves nothing about the contract on its own. Each case is also checked
independently:

1. **On the chain, after every transaction.** The live-check tool decodes the
   transaction's events (`tx <hash>`) and checks that its closing
   `ProjectSnapshot` equals the chain at that block, and recomputes the
   project's bookkeeping from its deposits and balances (`state`: the token
   balance equals the buckets, interest and fee per cycle and the reserve
   targets match the deposits, repayment is first in first out, nothing is
   paid ahead of its cycles…). The **On-chain** column says what each case
   should show. Expected values come from the contract source
   (`contracts/contracts/Project.sol`), never from the page.
2. **Refusals, by simulation.** The site stops a call the contract would
   refuse before MetaMask opens, so the contract's own refusal is never sent.
   `refusals` simulates the refusal cases of real-estate-fund's
   [`TESTING.md`](https://github.com/AllThingsLemon/real-estate-fund/blob/develop/docs/TESTING.md)
   that apply to the project's current state, from the right wallets, for
   free (the ones a simulation can reach without moving tokens first). Run it
   at each [checkpoint](#checkpoints). The fund repo's
   `sandbox-negative-cases.ts` replays all 79 on a local copy of the sandbox.
3. **The site's own wording of refusals.** All 44 TESTING.md refusal cases
   were replayed through the site's error messages on an anvil fork on Nov 3
   (see [WALLET_PLAN.md](WALLET_PLAN.md), phase 6). Rerun after any change to
   `src/fund/errors.ts` or a new factory version.

The live-check tool, the case-by-case map against real-estate-fund's
TESTING.md, the run logs, the findings log and the report for the contract
team are kept in the **private** real-estate-fund repo
(`docs/engine-e2e/`). Anything found in the contracts goes there, never in
this public repo.

## Setup

1. **A test site with a `fund` block.** Point a client folder's
   `site.config.json` at the sandbox, link at least one listing to a project
   (CMS → listing → Investment → project address), then run it:

   ```json
   "fund": {
     "chainId": 97,
     "factories": ["0x8f2548d8d41394BA2c8Cc1bc364CD24EC2eA7FC1"],
     "lens": "0x2aa6717bfA3122dCeFdb91931cE48E946Ae816a2",
     "trustedOwners": ["<W1>"],
     "indexerUrl": "http://localhost:8787"
   }
   ```

   ```bash
   pnpm install
   pnpm client ../<test-client>    # makes ./client
   pnpm dev                        # http://localhost:4321
   ```

   For the WalletConnect cases add loans-dapp's Reown project ID as
   `walletConnectProjectId`, and the test site's address to that Reown
   project's allowlist.
2. **The indexer** (lists and history on `/manage/`). Use the deployed
   indexer, with the test site's origin in its `DASHBOARD_ORIGIN`, or run one
   locally from real-estate-fund:

   ```bash
   cd indexer && cp .dev.vars.example .dev.vars    # set DASHBOARD_ORIGIN=http://localhost:4321
   npm ci && npm run dev                           # http://localhost:8787
   ```

   It catches up with the sandbox in under a minute (`/v1/status`: `cursor`
   reaches `head`).
3. **The fund's test console** (real-estate-fund `ui/`, see its TESTING.md) in
   a second tab. The site has no mock controls, like production, so the
   console mints tokens and pool earnings, fills LEMX slices, sets the LEMX
   price, toggles the pool's fee and funds pool withdrawals.
4. **The live-check tool** (real-estate-fund `docs/engine-e2e/`): `npm install`
   once, and fill in W1–W5 and the project in `wallets.json`.
5. **Wallets, gas and funds.** One MetaMask (or Rabby) with five accounts, the
   same as the fund's plans:

   | Label | Plays |
   |---|---|
   | **W1** | Owner / Admin. Also the project's company and fee wallet |
   | **W2** | Manager + Operations + Company (given in D2.1) |
   | **W3** | US investor |
   | **W4** | International investor |
   | **W5** | No roles |

   Each needs tBNB (https://www.bnbchain.org/en/testnet-faucet) and tUSDT
   (**+1M tUSDT** in the console's header).
6. **Projects.** Create them in the fund dashboard or the console (D1) with W1
   as owner, company wallet and fee wallet, then link each to a listing and
   add W1 to `trustedOwners`. Some cases need a project of their own: closing
   the raise (D3.8, C.13) is permanent, filling the cap (C.3, C.4) needs a
   small cap, and full repayment (D8.6, C.14, C.15) needs every deposit
   repaid.

   | | |
   |---|---|
   | Engine QA project | `0x7fAB1DA7b651c3056131F4AD0067276763B365EE` (owner W1, linked to Example Listing One) |
   | Factory / lens | `0x8f2548d8d41394BA2c8Cc1bc364CD24EC2eA7FC1` / `0x2aa6717bfA3122dCeFdb91931cE48E946Ae816a2` |
   | tUSDT | `0xb3414bB6e640783931360833765E4d565D5bfF01` |

7. **Timing.** Sandbox cycles are 5 minutes, the pool lock 30 minutes and the
   term 2 hours, so interest comes due while you test. The pages re-read the
   chain every 30 seconds and right after each transaction. Indexer lists and
   history catch up within seconds.

## Checkpoints

Run `state` and `refusals` at each of these, and keep the output in the run
log. Each state switches on a different set of refusal cases.

| Checkpoint | Reached in |
|---|---|
| Start, before any deposit | Setup |
| Deposits in, principal placed, payments current | D3.4 |
| A cycle due, not yet paid | D5.2 |
| A payment waiting for money, fees deferred | D5.4 |
| A LEMX purchase running | D7.1 |
| Deposits stopped / paused | D3.7, D6.5 |
| A pool withdrawal queued | D9.1 |
| Raise closed or filled; fully repaid | D3.8, D8.6 |

## Reading the test tables

| Mark | The case **passes** when… |
|---|---|
| ✅ | The action succeeds: MetaMask asks once (plus once to allow tokens, where the action takes them), the toast says **Confirmed** with a link to BscScan, the page shows what **Expected** says, and the chain shows what **On-chain** says. |
| 🔒 | The button is **dimmed for this wallet** with "🔒 *Role* only" under it, and its tooltip says what it would do. Pressing it does nothing and MetaMask doesn't open. **On-chain:** the simulated call is refused with `MissingRole`. |
| ❌ | The action is **stopped before MetaMask opens**: either the button is dimmed with the reason under it, or pressing it shows the plain-English message in **Expected** in the toast (bottom right). **On-chain:** the simulated call is refused with the error named. |

A raw error (`0x…`, a custom error name, "execution reverted"), a MetaMask
prompt for a transaction that then fails, a figure on the page that disagrees
with the chain, an event or amount that disagrees with the contract code, or
a bookkeeping check that fails is always a failure. Log it (see
[Reporting](#reporting)).

---

## S. Site and header

| # | Steps | Expected |
|---|---|---|
| S.1 ✅ | Build a site **without** a `fund` block on this branch and on `main`; compare the two `dist/` folders | Byte-identical. No React, wallet code or `/manage/` |
| S.2 ✅ | Fund site, any page (home, About, a listing) | Header shows **Connect wallet**. On pages with nothing on-chain it appears once the page is idle |
| S.3 ✅ | Connect W1, then W3, then W5 | **Manage** appears next to the wallet for W1 (a role), not for W3 or W5. It's highlighted on `/manage/` |
| S.4 ✅ | W5 is offered ownership (D2.3) or is the current wallet in a handover (D2.4) | **Manage** appears for W5 while the handover waits |
| S.5 ✅ | Connected, move between home, a listing, `/portfolio/`, `/manage/` and About ten times, waiting about a minute between some | The wallet stays connected on every page (no "Connect wallet" while MetaMask is connected) |
| S.6 ✅ | Connect on another network, then send any action | MetaMask asks to switch to BNB Smart Chain Testnet, then continues |
| S.7 ✅ | Any wallet page on testnet | The orange **Test network** banner shows |
| S.8 ❌ | Link a listing to a project from another factory, or owned by a wallet not in `trustedOwners` | The listing shows no panel, `/manage/` doesn't list it, and the browser console says why |
| S.9 ✅ | Phone width (375 px): header with Manage and the wallet | Logo, menu, Manage and the wallet fit on one row; nothing scrolls sideways |

## L. Listing: investing

| # | Steps | Expected | On-chain |
|---|---|---|---|
| L.1 ✅ | No wallet, a linked listing | Live raise progress, rates per cycle, cycle length, term, minimum, status, payment health. **Connect wallet to invest** | The figures equal `state` |
| L.2 ❌ | W5 (not approved) | "This wallet isn't approved for *project* yet", W5's address with **Copy**, and how approval works (the client's text from Site settings → Investor disclosures, or the default) | Sim `deposit` from W5: `NotApprovedInvestor` |
| L.3 ✅ | W3 after D3.1 | Invest form shows "Approved as a US investor" and the US rate. Balance and minimum under the amount | `investorClass(W3)` = US |
| L.4 ❌ | W3: an amount below the minimum, then above the balance | The form says why and **Invest** stays dimmed | Sim below the minimum: `BelowMinimumDeposit` |
| L.5 ✅ | W3: first investment of 10,000 | The disclosure acknowledgements must be ticked. MetaMask asks to allow exactly 10,000, then to invest. The position appears under **Your investment**; the allowance is back to 0 | `DepositRecorded` (kind 0, US, rate 2%, principal = tUSDT in = 10,000, maturity = start + term); waiting principal +10,000; interest per cycle +200; allowance 0 |
| L.6 ✅ | Reject in MetaMask | Toast: "You cancelled in your wallet." Nothing else changes | No transaction |
| L.7 ✅ | After a cycle comes due: **Collect interest due** | Pays this deposit (and any older ones due first). "Paid N tUSDT to this wallet" | `payDue` from the oldest unpaid deposit: `InterestPaid` per whole cycle (principal × rate), `MgmtFeePaid` or `MgmtFeeDeferred` per cycle; W3's balance + the interest |
| L.8 ❌ | Reserves short of what's owed up to W3's deposit | **Collect** is dimmed with "needed / available". The status says **Waiting on the reserve** only while the reserve can't cover it; after money is added it says **Interest due** | `state`: interest owed through W3's deposit > reserve + net earnings |
| L.9 ✅ | Deposit past maturity, then repaid (D8.2) | Status **Matured**, then **Repaid**. Its date row reads "Matured", never "Matures" with a past date | `BalloonPaid`; the deposit `repaid`; `nextPayoffId` +1 |
| L.10 ❌ | Deposits stopped (D3.7), paused (D6.5), raise closed or filled | The status reads **Deposits stopped**, **Paused**, **Raise closed** or **Fully funded**, and there's no way to invest. Positions and Collect still work | Sim `deposit`: `ProjectIsKilled` / `ProjectPaused` / `ProjectNotOpen` |
| L.11 ✅ | Phone width | The panel sits after the summary; the sticky **Invest** bar shows while it's off screen | — |

## P. /portfolio/

| # | Steps | Expected |
|---|---|---|
| P.1 ✅ | W3 with deposits on two listings, one of them hidden in the CMS | Both projects' positions, with totals. The hidden listing's has no link |
| P.2 ✅ | W5 | "This wallet has no investments on this site yet." and "Showing wallet …" |
| P.3 ✅ | After L.7 and D8.2 | Interest received and **Repaid** match the listing and `state` (cycles paid × interest per cycle) |

---

## G. General (`/manage/`)

| # | Steps | Expected |
|---|---|---|
| G.1 ✅ | Open `/manage/` and a project with **no wallet** | Every page renders with live data. Action buttons say "Connect a wallet to act" and open the connect dialog |
| G.2 ✅ | Connect W1 on another network, send any action | MetaMask asks to switch networks first, then continues |
| G.3 ✅ | `/manage/` with W2 | **Your projects** lists only this site's projects where W2 holds a role (or has a handover), with role chips. **All** lists every linked project on this site. Each card: health, raised of cap, outstanding, next payment, matured count |
| G.4 ❌ | A listing linked to a project the site doesn't trust (S.8) | Not listed; the browser console says why. (There's no "Open by address": a site manages only its own linked listings) |
| G.5 ✅ | Stop the indexer (or remove `indexerUrl`) and reload | Header: **History unavailable** (or no history status without `indexerUrl`). Balances, Needs attention and every action still work. The allowlist, payment histories, Activity, the chart and role lists say why they're missing, and stay that way (no flicker every few seconds); Settings offers **Check a wallet** |
| G.6 ✅ | A dark client theme; window at 375 px | Readable in both; nothing scrolls sideways; tables scroll inside their cards; inline forms stack |
| G.7 ✅ | Any action → reject in MetaMask | Toast: "You cancelled in your wallet." Nothing else changes |
| G.8 ✅ | Hover every button; tab through a page with the keyboard | Every button has a tooltip saying what it does; every page, section and unclear figure has an ⓘ. Tooltips open on keyboard focus, close with Escape, and don't cover the button on a tap. Dimmed buttons still take focus and say why |
| G.9 ✅ | Send an action, reload before it confirms | The toast comes back and follows it to **Confirmed** |
| G.10 ✅ | A multi-step action (Pay investors with several runs; an action that needs a token allowance) | One toast per step, then a closing line saying what happened. **On-chain:** one transaction per step, each snapshot equal to the chain |

## D1. Create a project

The site can't create projects (projects are created in the fund dashboard,
then linked in the CMS). Run D1.1–D1.4 in the fund dashboard, then:

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D1.5 ✅ | Link the new project to a listing (CMS) and add its owner to `trustedOwners`; rebuild | The listing shows the invest panel; `/manage/` lists the project under the owner's **Your projects** with Owner and Admin chips | Creation transaction: `ProjectInitialized`, `OwnershipTransferred(0x0 → W1)`, `RoleGranted` OWNER and ADMIN to W1; factory `isProject` true |

## D2. Team and roles (Settings & team)

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D2.1 ✅ | W1 → **Add a team member**: Manager, Operations and Company to W2 | Each role card lists W2. With W2 connected, the project header shows its role chips and **Manage** shows in the site header | `RoleGranted` ×3 (no snapshot: roles don't move money); `state` shows W2's three roles |
| D2.2 🔒 | W5 → Settings: **Grant**, **Pause**, **Transfer**, **Propose** | Dimmed; hints say 🔒 Owner only / Admin only | Sims: `MissingRole(OWNER_ROLE, W5)` / `MissingRole(ADMIN_ROLE, W5)`; granting the owner role is refused for everyone (`OwnerRoleViaTransferOnly`) |
| D2.3 ✅ | W1 → Ownership → transfer to W5 (confirm dialog). First add W5 to `trustedOwners`. Connect W5 | W5's Needs attention: **Ownership offered to you** → **Accept ownership**. After it, W1 has no roles. Transfer back the same way | `OwnershipTransferStarted`, then `OwnershipTransferred(W1 → W5)`; `state`: W1 holds **no** roles, W5 Owner + Admin, W2's untouched. Sim `acceptOwnership` from W3: `NotPendingOwner` |
| D2.4 ✅ | W1 → Payout wallets → propose W3 as company wallet. Connect the *current* company wallet | Its Needs attention: **Company wallet change waiting on you** → **Accept**. Payout wallets shows W3 | `CompanyWalletProposed`, `CompanyWalletChanged`. Sim accept from W5: `NotCurrentWallet`. Same for the fee wallet |
| D2.5 ✅ | W2 → its Manager card → **Leave** (confirm dialog); W1 gives it back. W1 → **Remove** W2's Operations role (confirm), then gives it back | The role cards update after each; both dialogs say what happens before anything is sent | `RoleRevoked`, `RoleGranted` |
| D2.6 ✅ | No indexer (G.5) → **Check a wallet** with W2's address | Lists W2's roles, read from the chain | Matches `state` |

## D3. Raise

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D3.1 ✅ | W2 → Raise → approve W3 (US) and W4 (International, referrer W2) | Both appear in the allowlist with type and referrer. **Change** → remove one and add it back: it moves to "removed earlier" and returns | `InvestorSet(W3, None → US, 0x0)`, `InvestorSet(W4, None → Global, W2)`; removal `→ None` |
| D3.2 🔒 | W1 (owner, not manager) → Raise | The allowlist form's buttons: 🔒 Manager only | Sim `setInvestor` from a non-manager: `MissingRole(MANAGER_ROLE)` |
| D3.3 ✅ | W3 invests 10,000 and W4 100,000 **from the listing** (L.5) | Raise progress and Investors update. Needs attention: **Principal ready to place in the pool** (or **waiting for the pool's minimum** below 1,000) | Two `DepositRecorded`; `state`: interest per cycle = 200 + 3,000, interest target 2× that, fee target 0.5% × 110,000; all bookkeeping checks pass |
| D3.4 ✅ | Overview → **Place it** | "Waiting to be placed" goes to 0; "Lent in the pool" rises; the task goes | `PrincipalDeployed(amount, feePaid, lock, unlock)`; waiting principal → 0 (or 1 wei after a pool fee); pool: locked + amount |
| D3.5 ✅ | W2 → **Record a deposit made off the site** for W3, credit within the maximum premium | Recorded; the investor's page shows it as "recorded" with "received" under the principal | `DepositRecorded` kind 1, principal = credit, tUSDT in = paid; W2 pays only what's paid in; waiting principal + paid in |
| D3.6 ❌ | Credit above the tUSDT paid in × (1 + max premium) | The field says "The credit can be at most …" and **Record deposit** stays dimmed | Sim: `InvalidCredit` (also for credit below what's paid in) |
| D3.7 ✅ | W1 → **Stop deposits** (confirm), then **Resume deposits** | Header badge **Deposits stopped**; the listing refuses deposits (L.10); investor payments carry on | `KillSwitchActivated`, `KillSwitchCancelled`. While stopped, run `refusals`: deposits `ProjectIsKilled`, payments and collecting still succeed |
| D3.8 ✅ | On a project made for it: W1 → **Close the raise** (confirm) | Badge **Raise closed**; the listing stops taking deposits for good | `ProjectClosed(by, totalRaised)`; sims: deposit `ProjectNotOpen`, closing again `ProjectNotOpen` |

## D4. Investors and positions

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D4.1 ✅ | Investors | One row per investor: type, deposits (open/all), outstanding, interest paid, next maturity, status. Filters (All, US, International, Needs attention) and search work | Rows equal `state`'s deposits; interest paid totals equal `interestPaidByClass` |
| D4.2 ✅ | Open W3 | Each deposit: rate, cycles paid and due, next payment, maturity. Payment history lists only W3's events; **Load older** pages back | `getDeposit` / `cyclesOwed` for each |
| D4.3 ❌ | A deposit that owes interest → **Renew** | Dimmed: "Its interest has to be current first…" | Sim `renew`: `InterestNotCurrent(id)` |
| D4.4 ✅ | After paying investors, W2 (Company) → **Renew** | The tooltip shows the fee (paid to the investor) and the new maturity; MetaMask asks to allow the fee, then renew. Maturity updates and shows "(renewed)" | `DepositRenewed(id, investor, W2, fee = principal × renewal rate, newMaturity = later of maturity and now + renewal term)`; investor + fee, W2 − fee. Sims: renewing again `AlreadyRenewed`, a repaid deposit `AlreadyRepaid`, an unknown id `InvalidDeposit` |

## D5. Earnings and investor payments

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D5.1 ✅ | Console: mint pool earnings for the project | **Pool earnings ready to collect** → **Collect**. Earnings & payments shows where it would go first. The interest reserve fills, then the management reserve, then earnings | `EarningsClaimed`; `Allocated(LpEarnings, amount, toInterestReserve, toMgmtReserve, toNetEarnings)` equal to the preview |
| D5.2 ✅ | Wait a cycle (5 min) | Health **Payments due**; **Interest due on N deposits** → **Pay investors**. Split and development withdrawal are dimmed: investors have to be current | `state`: payments due, cycles owed per deposit; sims: split `PaymentsLate`; withdraw `PaymentsLate` once there are development funds (with none, `ExceedsBalance` comes first) |
| D5.3 ✅ | **Pay investors** | As many runs as needed (a toast per run), then "Investors are current. Paid N cycles". Health **On track**; payment history shows Interest paid and Management fee paid | Each run: `InterestPaid` per due cycle, oldest deposit first, `MgmtFeePaid` per cycle while the management reserve covers it (it holds one cycle of fees; past that a fee shows `MgmtFeeDeferred`, then `DeferredMgmtFeePaid` at the end of the same run); after the last, `nextDue` is ahead and `payCursor` back at the next deposit in line |
| D5.4 ✅ | Drain the reserves (no earnings, several cycles), then **Pay investors** | Stops with "…is waiting for money" in the toast. Health **Late**; critical task **Interest payment waiting for money (deposit #n)** | Net earnings drawn first (`BucketMoved` net → reserve), then `InterestWaiting(id, investor, cycle, needed, available)`; `blockedFrom` = id; no partial payment. Sims: a later deposit `OlderPaymentWaiting(id)`, split and withdraw `PaymentsLate`, repaying that deposit `InterestNotCurrent` |
| D5.5 ✅ | **Add money** (enough; the preview shows where it goes), then **Pay investors** | Catches up; deferred management fees are paid first; **Management fees deferred** goes | `InjectionApplied(funder, total, toI, toM, toNet)` equal to the preview; then `InterestPaid` for the backlog and `DeferredMgmtFeePaid`; `blockedFrom` cleared, deferred fees 0 |
| D5.6 ✅ | **Fund one bucket instead** → each bucket in turn | The bucket grows; a reserve over its target passes the extra to earnings | `BucketFunded(bucket, funder, amount, after)`; over target: `BucketMoved` reserve → net (Rebalance) |

## D6. Surplus and development funds

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D6.1 ❌ | Payments due → try **Split** | Dimmed: "Investors have to be current first." | Sim: `PaymentsLate` |
| D6.2 ✅ | Current → W2 splits earnings into repayment / development / LEMX, using **Use the rest** for the last | The preview matches the result: repayment fund, development funds and LEMX set-aside rise by those amounts | `SplitExecuted(id, W2, repay, dev, compound, netEarningsAfter)`. Sims: above net earnings `ExceedsNetEarnings`, all zero `InvalidAmount` |
| D6.3 🔒 | W5 → Surplus & development | Split, Withdraw and Start buying LEMX: 🔒 Manager only | Sims: `MissingRole(MANAGER_ROLE, W5)` |
| D6.4 ✅ | W2 → **Max** → **Withdraw** | Arrives at the company wallet shown on the card | `DevWithdrawn(to = company wallet, by = W2, amount)` (not to W2). Sim above the balance: `ExceedsBalance` |
| D6.5 ❌ | Project paused (Settings → **Pause**) → Withdraw | Dimmed: "The project is paused." Investor payments still run. **Resume** afterwards | `Paused`, `Unpaused`. While paused, `refusals`: withdraw and deposit `ProjectPaused`, payments and collecting succeed |

## D7. Buying LEMX (compounding)

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D7.1 ✅ | W2 → **Start buying LEMX** | The card shows 0 of 24 slices, the next slice time, the floor and the market price; header badge **Buying LEMX** | `CompoundStarted(id, swapId, amount, 24, 3600, minPrice)`, minPrice = market × (1 − slippage); set-aside → 0, in flight = amount. Sims: starting again `CompoundInFlight`, finishing now `CompoundNotFinished` |
| D7.2 ✅ | Console: fill a few slices | Progress updates; Overview shows **Buying LEMX: n of 24 slices filled** | The scheduler's swap: slices completed, LEMX bought |
| D7.3 ✅ | Console: fill the rest | **LEMX purchase finished** → **Finish** appears exactly when nothing is left to swap. Finishing locks the LEMX in the pool | `CompoundFinalized`, `LemxDeposited(lemx, credit, unlock)` with credit at the feed price; pool principal + credit |
| D7.4 ✅ | Start again → **Lower floor** → **Cancel the purchase** (confirm) | The floor drops; unswapped tUSDT goes back to the LEMX set-aside; Activity reads **LEMX purchase #N ended early** | `CompoundFloorEscalated(id, old, new)`; sim a higher floor `FloorNotLower`. Cancel: `CompoundFinalized` with the unswapped amount returned; set-aside + that amount |
| D7.5 ✅ | LEMX below the pool's minimum when a purchase finishes | **LEMX waiting to be locked** → **Lock now** once it can be locked (until then it says why). The Finish or Cancel message says the LEMX is held, not locked | No `LemxDeposited`; LEMX held > 0; sim `depositHeldLemx` `BelowLpMinimum` until it reaches the minimum, then `LemxDeposited` |
| D7.6 ✅ | A purchase running; console **Set LEMX $** above the start price × (1 + slippage), e.g. 9.5 | The card's badge reads **Below the floor** with a warning; the overview has the to-do **Buying LEMX: the market is below the floor** → **Lower floor** clears both. Set the price back afterwards | Console **Fill slices**: `BelowFloor(price, minPrice)` (the slice is skipped). After lowering: `CompoundFloorEscalated` and slices fill |

## D8. Repayment (first in, first out)

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D8.1 ✅ | Repayment fund short of the next deposit | The repayment line shows the next deposit, its cover and "… short". No Repay task | Sim `payoffNext`: `InsufficientPayoffPool(principal, fund)` |
| D8.2 ✅ | **Add to the repayment fund** (or split to repayment) to cover it | **The repayment fund covers deposit #n** → **Repay**. The investor receives the principal; the line moves on | `PayoffFunded(source, funder, amount, after)`; then the deposit's due cycles (`InterestPaid`), `BalloonPaid(id, investor, class, principal, fundAfter, …, nextPayoffId)`; targets shrink (`ReserveTargetsUpdated`); reserves over target → net (`BucketMoved`) |
| D8.3 ✅ | Let the next deposit pass maturity without cover | Health **Late**; critical **Deposit #n has matured and isn't repaid** with the shortfall | Lens `overdueBalloons` lists it |
| D8.4 ✅ | Cover a deposit that's past maturity | Still **Late** until repaid; the Repay task is critical | As D8.2 when repaid |
| D8.5 ✅ | The next deposit is the one waiting for interest (D5.4) while the fund covers it | No Repay button; the overdue task says its interest has to be paid first | Sim `payoffNext`: `InterestNotCurrent(id)` |
| D8.6 ✅ | Repay the last deposit of a filled or closed project | Health **Fully repaid**; what was left in the reserves moves to earnings; splits offer only development and LEMX | `ProjectFullyRepaid(at, reservesReleasedToNet)`; `BucketMoved … RepaidRelease`; reserves, fund and waiting principal → 0. Sims: adding repayment money `ProjectRepaid`, nothing left to repay `NothingToPayOff` |

## D9. Pool principal coming back (30-minute lock)

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D9.1 ✅ | After the principal's pool lock ends | **Pool principal has unlocked** → **Request it** | `LpWithdrawalRequested(id, amount)`; pool principal − amount. Before unlock, sim: `NothingUnlocked` |
| D9.2 ❌ | Before the pool funds the request | The request shows "Waiting for the pool to fund it" and **Claim** is dimmed ("Not funded yet."). The page reads whether it's funded, so it doesn't let you send the claim the dashboard would have refused | Sim `claimLpWithdrawal`: `Reverted("WithdrawalNotFullyFunded")` |
| D9.3 ✅ | Console: fund the queue → **Claim** | Arrives in earnings; the claim task goes | `LpWithdrawalClaimed(id, received)`, `Allocated(LpPrincipalMatured, …)`: net earnings + received. Sim claiming again: `Reverted("WithdrawalAlreadyClaimed")` |

## D10. Activity

| # | Steps | Expected | On-chain |
|---|---|---|---|
| D10.1 ✅ | Activity → each filter (Investor payments, Money in and out, Buying LEMX, Team and settings) | Plain lines with amounts; each time links to its transaction; **Load older** pages back. ProjectSnapshot bookkeeping events aren't listed | Spot-check three lines against `tx` |

## D11. Data check

| # | Steps | Expected |
|---|---|---|
| D11.1 ✅ | real-estate-fund: `cd indexer && node scripts/check.mjs <indexer URL>` | "all rows match the chain" |
| D11.2 ✅ | At each checkpoint: `state`, and compare a few figures on the pages with it | Every bookkeeping check passes; the pages match |

## C. Contract behaviour through the site

Contract behaviour from real-estate-fund's TESTING.md (its case numbers in
brackets) that the site drives but doesn't show directly. Check each on the
chain.

| # | Steps | Expected | On-chain |
|---|---|---|---|
| C.1 ✅ | (3.5) After W3 has a US deposit, change W3 to International (Raise → Change), then W3 invests again | W3's page shows the first deposit at 2% and the new one at 3% | `InvestorSet(US → Global)`; second `DepositRecorded` rate 3%; the first deposit's rate unchanged |
| C.2 ✅ | (4.1) W3 100,000 US and W4 200,000 International | Overview: per cycle 9,500 (8,000 interest + 1,500 fees); Investor terms: US 100,000 · International 200,000 outstanding | `state`: interest per cycle 8,000, interest target 16,000, fee target 1,500 |
| C.3 ✅ | (4.6) A project with 20,000 left: W3 enters 30,000 | The form says only 20,000 is left and it invests that; then **Fully raised** | `DepositRecorded` requested 20,000 (the site sends only what's left), principal 20,000; `ProjectFilled`; W3 − 20,000 only. The contract's own partial fill (requested above what's left) is in the fund's script |
| C.4 ✅ | (4.7) With 5,000 left (below the minimum): invest 5,000 | Accepted, because it completes the raise | `DepositRecorded` 5,000; `ProjectFilled` |
| C.5 ✅ | (5.5, 5.6) Console: turn the pool's fee on, mint 10,000 earnings, **Collect**; then turn "pull reverts" on and **Collect**. Turn both back off | First: 9,975 collected. Second: refused before MetaMask, in plain words | `EarningsClaimed` 9,975; the next `PrincipalDeployed` has `feePaid` > 0. Sim `sweep`: `Reverted("SweepRequired")` |
| C.6 ✅ | (6.2) Two deposits a few minutes apart; **Pay investors** as each comes due | Each deposit's next payment follows its own clock | `InterestPaid` only for whole cycles of each deposit |
| C.7 ✅ | (6.3) **Pay investors**, then try again in the same cycle | The second time the button is dimmed ("Investors are current") | Sim `payDue(payCursor, 50)` succeeds and pays nothing (no `InterestPaid`) |
| C.8 ✅ | (6.4) Skip three cycles with the reserve funded, then **Pay investors** | One run pays all three | `InterestPaid` for the three cycles of each deposit, in order |
| C.9 ✅ | (6b.10) Be late again; Fund one bucket → Earnings 300,000; try **Split**; **Pay investors**; **Split** | Split stays dimmed while late even though earnings could cover it; after paying it works | Sim split `PaymentsLate`; `payDue` draws on net (`BucketMoved` net → reserve) and pays every due cycle; then `SplitExecuted` |
| C.10 ✅ | (7.4) Interest reserve below target with earnings available; **Pay investors**, then split | The split preview offers only what's left after the reserve refills | `BucketMoved` net → reserve (Rebalance) first; `SplitExecuted` within the rest |
| C.11 ✅ | (10.4) US, International, US deposits; repay each | Repaid strictly in deposit order | `BalloonPaid` ids in order, whatever the class |
| C.12 ✅ | (11.1) Add repayment money from W2 (Operations), then from W1 | Both land in the repayment fund | `PayoffFunded` source **Operations** for W2, **CompanyFund** for W1 |
| C.13 ✅ | (12.2) An open project: repay every deposit, then **Close the raise** | Fully repaid once closed | `ProjectFullyRepaid` in the close transaction |
| C.14 ✅ | (12.4) After fully repaid: fund the interest reserve 1,000; split 0 / 500 / 500; add money 1,000 | The reserve flows on to earnings; the split offers development and LEMX only; added money all goes to earnings | `BucketMoved` reserve → net; `SplitExecuted`; `InjectionApplied` toNet 1,000 |
| C.15 ✅ | (12.5) Filled project, first deposit repaid, the last several cycles behind, some earnings: **Repay** without paying investors first | Repay works and the project is fully repaid | One transaction: `InterestPaid` for the overdue cycles, fees deferred then settled, `BalloonPaid`, `ProjectFullyRepaid` |
| C.16 ✅ | (13.3) Deposits stopped: add repayment money, add money, fund a bucket, collect, pay investors, split, start and finish buying LEMX, withdraw, repay, renew, request and claim pool principal | All succeed | Each as in its own case; `refusals` shows only deposits refused |
| C.17 ✅ | (13.4) Deposits stopped on one project | Another project still takes deposits | Sim `deposit` on the other project succeeds for an approved wallet |
| C.18 ✅ | (13.7) Paused: deposit and Withdraw refused; Pay investors, Collect, Repay and Add money work | As described | Sims `ProjectPaused` for deposit and withdraw; the others' transactions succeed |
| C.19 ✅ | (15) Every transaction in this plan | — | `tx`: every transaction that changes a balance ends with a `ProjectSnapshot` equal to the chain at that block; `state`: all bookkeeping checks pass at every checkpoint |
| C.20 ✅ | Leave a deposit unpaid past maturity, then repay | Interest keeps showing as due after maturity until it's repaid | `cyclesOwed` keeps counting past maturity; record the cycles paid at repayment against the term |

## A. Accessibility and layout

| # | Steps | Expected |
|---|---|---|
| A.1 ✅ | Keyboard only: listing panel, `/portfolio/`, every `/manage/` page | Logical focus order; every focused element shows a focus ring; dialogs trap focus and Escape closes them |
| A.2 ✅ | VoiceOver: the same pages | Every control has a name; tooltips are read as descriptions; task urgency and the menu's to-do counts are read out |
| A.3 ✅ | Contrast check, light and dark client themes | All text passes WCAG AA |
| A.4 ✅ | 1291 px and 375 px, every `/manage/` page | No overlapping elements; fields and buttons one height; buttons beside a field line up with it |

---

## Before mainnet

Every run so far used the sandbox mocks (18-decimal tokens, no pool fees).
From DASHBOARD_TESTING.md: deploy a factory against the live testnet Loans
pool (8-decimal stablecoin, real fees, withdrawal queue and minimums), point a
test site and an indexer at it, walk this plan, and check:

- [ ] Amounts read and enter correctly with the 8-decimal stablecoin on every page, and in approvals.
- [ ] The LEMX floor (LEMX per stablecoin against the feed price) and **Start buying LEMX** with the real token decimals.
- [ ] Payable pool calls: the site quotes the pool's BNB fee exactly through its PriceHelper (plus 5%). Confirm the quote clears the real fee, any extra comes back, and "can't be priced" shows when the PriceHelper has no price.
- [ ] **Place it** below and above the real minimum deposit. The 1 wei left after the fee shows as 0 and raises no task.
- [ ] Matured principal through the real withdrawal queue: request, **Claim** dimmed until funded, then claimed.

And for the site and the contracts:

- [ ] WalletConnect on a phone, with loans-dapp's Reown project ID and the site's domains in its allowlist.
- [ ] The deployed indexer with the site's domains (and preview domain) in `DASHBOARD_ORIGIN`.
- [ ] The Safe flow on BSC mainnet: an action from a Safe says "Sent to your Safe" and the page updates once the signers approve.
- [ ] A stage deploy with a `fund` block.
- [ ] Every finding marked for the contract team is answered or fixed, and the refusal checks and the fund's `sandbox-negative-cases.ts` pass against the mainnet factory's code.

## Results so far

With Jake's MetaMask (W1–W5), Nov 3–5, on four projects: Engine QA (raised
1,000,000, filled and fully repaid), a second project closed after one
deposit, a third created by W2 for owner W1 (filled, then repaid after
maturity), and a fourth for the payment cases (two deposits on their own
clocks, reserves short, recovery from pool earnings). Every case below has
run; A.2 from the accessibility tree rather than VoiceOver. Site problems found on the way are
fixed in the commits from 2c67453 on, except those listed as open.

| Case | Result |
|---|---|
| S.1–S.9 | Pass (S.1: develop and main byte-identical without `fund`; S.9 at 389 px, Chrome's narrowest with its side panel) |
| L.1–L.11 | Pass (L.11 needs an open raise for the sticky bar) |
| P.1–P.3 | Pass |
| G.1–G.10 | Pass; G.5 and D2.6 with an open problem: without an indexer the indexer-backed parts flicker every 10 s and Check a wallet loses its text |
| D1.5, D2.1–D2.6 | Pass; D2.4 for the company wallet only |
| D3.1–D3.8, D4.1–D4.4 | Pass |
| D5.1–D5.6, D6.1–D6.5 | Pass |
| D7.1–D7.6, D8.1–D8.6, D9.1–D9.3 | Pass |
| D10.1, D11.1, D11.2 | Pass |
| C.1–C.20 | Pass. C.20: a deposit repaid 8 minutes after maturity was paid one cycle past its term (interest continues after maturity, a question for the contract team) |
| A.1, A.2 | Pass (A.2 from the accessibility tree, not VoiceOver) |
| A.3 | Light theme passes everywhere. Client theme colours don't apply at all (`global.css` overrides them, on main too); with a dark theme forced on, two misses: the home card category chips and the red "bad" tone |
| C.19 | The snapshot after every transaction to a money-moving function equals the chain: 85 on Engine QA, 13 on the third project, all on the fourth; all bookkeeping checks pass at every checkpoint |
| Refusals | Live simulations pass at every checkpoint (33 to 41 cases, by the project's state), none failed. The fund's `sandbox-negative-cases.ts` 79 of 79, bytecode identical to the deployed sandbox |

## Reporting

For each failure note the case number, the wallet, the project address, the
page and what you saw (a screenshot with the toast), the transaction link or
the simulation output, and the `state` output. Site problems are fixed in
this repo. Anything in the contracts, the indexer, the sandbox mocks or the
fund's docs goes in the findings log in the private real-estate-fund repo
(`docs/engine-e2e/FINDINGS.md`), and into its report for the contract team.

## Coverage of DASHBOARD_TESTING.md

Every case in the fund dashboard's plan, and where it is here. (The
case-by-case map against the fund's contract plan, TESTING.md, is kept with
the findings in the private repo.)

| Dashboard | Here | Note |
|---|---|---|
| G.1 | G.1 | |
| G.2 | G.2, S.6 | |
| G.3 | G.3 | Lists this site's linked projects only |
| G.4 | G.4, S.8 | No "Open by address"; untrusted links aren't shown |
| G.5 | G.5 | Plus the no-`indexerUrl` case and Check a wallet |
| G.6 | G.6, A.4 | Client themes instead of system dark mode |
| G.7 | G.7, L.6 | |
| D1.1–D1.4 | D1 (run in the fund dashboard), D1.5 | The site doesn't create projects |
| D2.1–D2.4 | D2.1–D2.4 | D2.3 also needs `trustedOwners` |
| D3.1–D3.7 | D3.1–D3.7 | D3.3 invests from the listing instead of the console |
| D4.1–D4.4 | D4.1–D4.4 | |
| D5.1–D5.5 | D5.1–D5.5 | |
| D6.1–D6.5 | D6.1–D6.5 | |
| D7.1–D7.5 | D7.1–D7.5 | |
| D8.1–D8.6 | D8.1–D8.6 | |
| D9.1–D9.3 | D9.1–D9.3 | D9.2: Claim is dimmed until funded instead of being refused |
| D10.1 | D10.1 | |
| D11.1 | D11.1 | |
| Before mainnet (5 checks) | Before mainnet | The fee check is for exact quotes instead of a fee ladder |

Cases here that the dashboard's plan doesn't have: S.1–S.9, L.1–L.11,
P.1–P.3, G.8–G.10, D1.5, D2.5, D2.6, D3.8, D5.6, D11.2, C.1–C.20, A.1–A.4,
and the site and contract checks before mainnet.

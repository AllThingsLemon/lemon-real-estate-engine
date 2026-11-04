# End-to-end testing on BSC testnet

This plan checks a client site's wallet pages from start to finish against the
real-estate-fund **bscTestnet sandbox**: the listing's invest panel,
`/portfolio/`, the header's Manage link, and every page and action of
`/manage/`. It includes every case of the fund repo's dashboard test plan,
[`DASHBOARD_TESTING.md`](https://github.com/AllThingsLemon/real-estate-fund/blob/develop/docs/DASHBOARD_TESTING.md),
because `/manage/` follows that dashboard page for page. Its IDs (G, D1–D11)
are kept, so a result can be compared with the dashboard's. The
[coverage table](#coverage-of-dashboard_testingmd) maps every dashboard case
to its case here.

What this plan doesn't repeat:

- **Contract behaviour.** That's real-estate-fund's
  [`TESTING.md`](https://github.com/AllThingsLemon/real-estate-fund/blob/develop/docs/TESTING.md),
  run in its test console. Here the question is whether the site shows the
  right state, offers the right action, and explains a refusal in plain words.
- **The fund's 44 refusal cases.** Every one was replayed through the site's
  error messages on an anvil fork on Nov 3 (see
  [WALLET_PLAN.md](WALLET_PLAN.md), phase 6). Rerun that check after any
  change to `src/fund/errors.ts` or a new factory version.

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
   console mints tokens and pool earnings, fills LEMX slices and funds pool
   withdrawals.
4. **Wallets, gas and funds.** One MetaMask (or Rabby) with five accounts, the
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
5. **A project.** Create it in the fund dashboard or the console (D1) with W1
   as owner, company wallet and fee wallet, then link it to a listing and add
   W1 to `trustedOwners`. The current one is below. A project whose raise
   has been closed (D3.8) can't take deposits again, so close the raise only
   on a project made for that case.

   | | |
   |---|---|
   | Engine QA project | `0x7fAB1DA7b651c3056131F4AD0067276763B365EE` (owner W1, linked to Example Listing One) |
   | Factory / lens | `0x8f2548d8d41394BA2c8Cc1bc364CD24EC2eA7FC1` / `0x2aa6717bfA3122dCeFdb91931cE48E946Ae816a2` |
   | tUSDT | `0xb3414bB6e640783931360833765E4d565D5bfF01` |

6. **Timing.** Sandbox cycles are 5 minutes, the pool lock 30 minutes and the
   term 2 hours, so interest comes due while you test. The pages re-read the
   chain every 30 seconds and right after each transaction. Indexer lists and
   history catch up within seconds.

## Reading the test tables

| Mark | The case **passes** when… |
|---|---|
| ✅ | The action succeeds: MetaMask asks once (plus once to allow tokens, where the action takes them), the toast says **Confirmed** with a link to BscScan, and the page shows what **Expected** says. |
| 🔒 | The button is **dimmed for this wallet** with "🔒 *Role* only" under it, and its tooltip says what it would do. Pressing it does nothing and MetaMask doesn't open. |
| ❌ | The action is **stopped before MetaMask opens**: either the button is dimmed with the reason under it, or pressing it shows the plain-English message in **Expected** in the toast (bottom right). |

A raw error (`0x…`, a custom error name, "execution reverted"), a MetaMask
prompt for a transaction that then fails, or a figure that disagrees with the
chain is always a failure.

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

| # | Steps | Expected |
|---|---|---|
| L.1 ✅ | No wallet, a linked listing | Live raise progress, rates per cycle, cycle length, term, minimum, status, payment health. **Connect wallet to invest** |
| L.2 ❌ | W5 (not approved) | "This wallet isn't approved for *project* yet", W5's address with **Copy**, and how approval works (the client's text from Site settings → Investor disclosures, or the default) |
| L.3 ✅ | W3 after D3.1 | Invest form shows "Approved as a US investor" and the US rate. Balance and minimum under the amount |
| L.4 ❌ | W3: an amount below the minimum, then above the balance | The form says why and **Invest** stays dimmed |
| L.5 ✅ | W3: first investment of 10,000 | The disclosure acknowledgements must be ticked. MetaMask asks to allow exactly 10,000, then to invest. The position appears under **Your investment**; the allowance is back to 0 |
| L.6 ✅ | Reject in MetaMask | Toast: "You cancelled in your wallet." Nothing else changes |
| L.7 ✅ | After a cycle comes due: **Collect interest due** | Pays this deposit (and any older ones due first). "Paid N tUSDT to this wallet" |
| L.8 ❌ | Reserves short of what's owed up to W3's deposit | **Collect** is dimmed with "needed / available". The status says **Waiting on the reserve** only while the reserve can't cover it; after money is added it says **Interest due** |
| L.9 ✅ | Deposit past maturity, then repaid (D8.2) | Status **Matured**, then **Repaid**. Its date row reads "Matured", never "Matures" with a past date |
| L.10 ❌ | Deposits stopped (D3.7), paused (D6.5), raise closed or filled | The status reads **Deposits stopped**, **Paused**, **Raise closed** or **Fully funded**, and there's no way to invest. Positions and Collect still work |
| L.11 ✅ | Phone width | The panel sits after the summary; the sticky **Invest** bar shows while it's off screen |

## P. /portfolio/

| # | Steps | Expected |
|---|---|---|
| P.1 ✅ | W3 with deposits on two listings, one of them hidden in the CMS | Both projects' positions, with totals. The hidden listing's has no link |
| P.2 ✅ | W5 | "This wallet has no investments on this site yet." and "Showing wallet …" |
| P.3 ✅ | After L.7 and D8.2 | Interest received and **Repaid** match the listing |

---

## G. General (`/manage/`)

| # | Steps | Expected |
|---|---|---|
| G.1 ✅ | Open `/manage/` and a project with **no wallet** | Every page renders with live data. Action buttons say "Connect a wallet to act" and open the connect dialog |
| G.2 ✅ | Connect W1 on another network, send any action | MetaMask asks to switch networks first, then continues |
| G.3 ✅ | `/manage/` with W2 | **Your projects** lists only this site's projects where W2 holds a role (or has a handover), with role chips. **All** lists every linked project on this site. Each card: health, raised of cap, outstanding, next payment, matured count |
| G.4 ❌ | A listing linked to a project the site doesn't trust (S.8) | Not listed; the browser console says why. (There's no "Open by address": a site manages only its own linked listings) |
| G.5 ✅ | Stop the indexer (or remove `indexerUrl`) and reload | Header: **History unavailable** (or no history status without `indexerUrl`). Balances, Needs attention and every action still work. The allowlist, payment histories, Activity, the chart and role lists say why they're missing; Settings offers **Check a wallet** |
| G.6 ✅ | A dark client theme; window at 375 px | Readable in both; nothing scrolls sideways; tables scroll inside their cards; inline forms stack |
| G.7 ✅ | Any action → reject in MetaMask | Toast: "You cancelled in your wallet." Nothing else changes |
| G.8 ✅ | Hover every button; tab through a page with the keyboard | Every button has a tooltip saying what it does; every page, section and unclear figure has an ⓘ. Tooltips open on keyboard focus, close with Escape, and don't cover the button on a tap. Dimmed buttons still take focus and say why |
| G.9 ✅ | Send an action, reload before it confirms | The toast comes back and follows it to **Confirmed** |
| G.10 ✅ | A multi-step action (Pay investors with several runs; an action that needs a token allowance) | One toast per step, then a closing line saying what happened |

## D1. Create a project

The site can't create projects (projects are created in the fund dashboard,
then linked in the CMS). Run D1.1–D1.4 in the fund dashboard, then:

| # | Steps | Expected |
|---|---|---|
| D1.5 ✅ | Link the new project to a listing (CMS) and add its owner to `trustedOwners`; rebuild | The listing shows the invest panel; `/manage/` lists the project under the owner's **Your projects** with Owner and Admin chips |

## D2. Team and roles (Settings & team)

| # | Steps | Expected |
|---|---|---|
| D2.1 ✅ | W1 → **Add a team member**: Manager, Operations and Company to W2 | Each role card lists W2. With W2 connected, the project header shows its role chips and **Manage** shows in the site header |
| D2.2 🔒 | W5 → Settings: **Grant**, **Pause**, **Transfer**, **Propose** | Dimmed; hints say 🔒 Owner only / Admin only |
| D2.3 ✅ | W1 → Ownership → transfer to W5 (confirm dialog). First add W5 to `trustedOwners`. Connect W5 | W5's Needs attention: **Ownership offered to you** → **Accept ownership**. After it, W1 has no roles. Transfer back the same way |
| D2.4 ✅ | W1 → Payout wallets → propose W3 as company wallet. Connect the *current* company wallet | Its Needs attention: **Company wallet change waiting on you** → **Accept**. Payout wallets shows W3 |
| D2.5 ✅ | W2 → its Manager card → **Leave** (confirm dialog); W1 gives it back. W1 → **Remove** W2's Operations role (confirm), then gives it back | The role cards update after each; both dialogs say what happens before anything is sent |
| D2.6 ✅ | No indexer (G.5) → **Check a wallet** with W2's address | Lists W2's roles, read from the chain |

## D3. Raise

| # | Steps | Expected |
|---|---|---|
| D3.1 ✅ | W2 → Raise → approve W3 (US) and W4 (International, referrer W2) | Both appear in the allowlist with type and referrer. **Change** → remove one and add it back: it moves to "removed earlier" and returns |
| D3.2 🔒 | W1 (owner, not manager) → Raise | The allowlist form's buttons: 🔒 Manager only |
| D3.3 ✅ | W3 invests 10,000 and W4 100,000 **from the listing** (L.5) | Raise progress and Investors update. Needs attention: **Principal ready to place in the pool** (or **waiting for the pool's minimum** below 1,000) |
| D3.4 ✅ | Overview → **Place it** | "Waiting to be placed" goes to 0; "Lent in the pool" rises; the task goes |
| D3.5 ✅ | W2 → **Record a deposit made off the site** for W3, credit within the maximum premium | Recorded; the investor's page shows it as "recorded" with "received" under the principal |
| D3.6 ❌ | Credit above the tUSDT paid in × (1 + max premium) | The field says "The credit can be at most …" and **Record deposit** stays dimmed |
| D3.7 ✅ | W1 → **Stop deposits** (confirm), then **Resume deposits** | Header badge **Deposits stopped**; the listing refuses deposits (L.10); investor payments carry on |
| D3.8 ✅ | On a project made for it: W1 → **Close the raise** (confirm) | Badge **Raise closed**; the listing stops taking deposits for good |

## D4. Investors and positions

| # | Steps | Expected |
|---|---|---|
| D4.1 ✅ | Investors | One row per investor: type, deposits (open/all), outstanding, interest paid, next maturity, status. Filters (All, US, International, Needs attention) and search work |
| D4.2 ✅ | Open W3 | Each deposit: rate, cycles paid and due, next payment, maturity. Payment history lists only W3's events; **Load older** pages back |
| D4.3 ❌ | A deposit that owes interest → **Renew** | Dimmed: "Its interest has to be current first…" |
| D4.4 ✅ | After paying investors, W2 (Company) → **Renew** | The tooltip shows the fee (paid to the investor) and the new maturity; MetaMask asks to allow the fee, then renew. Maturity updates and shows "(renewed)" |

## D5. Earnings and investor payments

| # | Steps | Expected |
|---|---|---|
| D5.1 ✅ | Console: mint pool earnings for the project | **Pool earnings ready to collect** → **Collect**. Earnings & payments shows where it would go first. The interest reserve fills, then the management reserve, then earnings |
| D5.2 ✅ | Wait a cycle (5 min) | Health **Payments due**; **Interest due on N deposits** → **Pay investors**. Split and development withdrawal are dimmed: investors have to be current |
| D5.3 ✅ | **Pay investors** | As many runs as needed (a toast per run), then "Investors are current. Paid N cycles". Health **On track**; payment history shows Interest paid and Management fee paid |
| D5.4 ✅ | Drain the reserves (no earnings, several cycles), then **Pay investors** | Stops with "…is waiting for money" in the toast. Health **Late**; critical task **Interest payment waiting for money (deposit #n)** |
| D5.5 ✅ | **Add money** (enough; the preview shows where it goes), then **Pay investors** | Catches up; deferred management fees are paid first; **Management fees deferred** goes |
| D5.6 ✅ | **Fund one bucket instead** → each bucket in turn | The bucket grows; a reserve over its target passes the extra to earnings |

## D6. Surplus and development funds

| # | Steps | Expected |
|---|---|---|
| D6.1 ❌ | Payments due → try **Split** | Dimmed: "Investors have to be current first." |
| D6.2 ✅ | Current → W2 splits earnings into repayment / development / LEMX, using **Use the rest** for the last | The preview matches the result: repayment fund, development funds and LEMX set-aside rise by those amounts |
| D6.3 🔒 | W5 → Surplus & development | Split, Withdraw and Start buying LEMX: 🔒 Manager only |
| D6.4 ✅ | W2 → **Max** → **Withdraw** | Arrives at the company wallet shown on the card |
| D6.5 ❌ | Project paused (Settings → **Pause**) → Withdraw | Dimmed: "The project is paused." Investor payments still run. **Resume** afterwards |

## D7. Buying LEMX (compounding)

| # | Steps | Expected |
|---|---|---|
| D7.1 ✅ | W2 → **Start buying LEMX** | The card shows 0 of 24 slices, the next slice time, the floor and the market price; header badge **Buying LEMX** |
| D7.2 ✅ | Console: fill a few slices | Progress updates; Overview shows **Buying LEMX: n of 24 slices filled** |
| D7.3 ✅ | Console: fill the rest | **LEMX purchase finished** → **Finish** appears exactly when nothing is left to swap. Finishing locks the LEMX in the pool |
| D7.4 ✅ | Start again → **Lower floor** → **Cancel the purchase** (confirm) | The floor drops; unswapped tUSDT goes back to the LEMX set-aside |
| D7.5 ✅ | LEMX below the pool's minimum when a purchase finishes | **LEMX waiting to be locked** → **Lock LEMX** once it can be locked (until then it says why) |

## D8. Repayment (first in, first out)

| # | Steps | Expected |
|---|---|---|
| D8.1 ✅ | Repayment fund short of the next deposit | The repayment line shows the next deposit, its cover and "… short". No Repay task |
| D8.2 ✅ | **Add to the repayment fund** (or split to repayment) to cover it | **The repayment fund covers deposit #n** → **Repay**. The investor receives the principal; the line moves on |
| D8.3 ✅ | Let the next deposit pass maturity without cover | Health **Late**; critical **Deposit #n has matured and isn't repaid** with the shortfall |
| D8.4 ✅ | Cover a deposit that's past maturity | Still **Late** until repaid; the Repay task is critical |
| D8.5 ✅ | The next deposit is the one waiting for interest (D5.4) while the fund covers it | No Repay button; the overdue task says its interest has to be paid first |
| D8.6 ✅ | Repay the last deposit of a filled or closed project | Health **Fully repaid**; what was left in the reserves moves to earnings; splits offer only development and LEMX |

## D9. Pool principal coming back (30-minute lock)

| # | Steps | Expected |
|---|---|---|
| D9.1 ✅ | After the principal's pool lock ends | **Pool principal has unlocked** → **Request it** |
| D9.2 ❌ | Before the pool funds the request | The request shows "Waiting for the pool to fund it" and **Claim** is dimmed ("Not funded yet."). The page reads whether it's funded, so it doesn't let you send the claim the dashboard would have refused |
| D9.3 ✅ | Console: fund the queue → **Claim** | Arrives in earnings; the claim task goes |

## D10. Activity

| # | Steps | Expected |
|---|---|---|
| D10.1 ✅ | Activity → each filter (Investor payments, Money in and out, Buying LEMX, Team and settings) | Plain lines with amounts; each time links to its transaction; **Load older** pages back. ProjectSnapshot bookkeeping events aren't listed |

## D11. Data check

| # | Steps | Expected |
|---|---|---|
| D11.1 ✅ | real-estate-fund: `cd indexer && node scripts/check.mjs <indexer URL>` | "all rows match the chain" |
| D11.2 ✅ | After a session, compare a few figures on the pages with BscScan or `cast call` (deposit cycles paid, the project's token balance, a wallet's balance) | They match |

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

And for the site:

- [ ] WalletConnect on a phone, with loans-dapp's Reown project ID and the site's domains in its allowlist.
- [ ] The deployed indexer with the site's domains (and preview domain) in `DASHBOARD_ORIGIN`.
- [ ] The Safe flow on BSC mainnet: an action from a Safe says "Sent to your Safe" and the page updates once the signers approve.
- [ ] A stage deploy with a `fund` block.

## Results so far

With Jake's MetaMask on the Engine QA project (owner W1), Nov 3–4. Cases
marked *old pages* ran before `/manage/` became the dashboard port (2c67453)
and need a rerun there.

| Case | Result |
|---|---|
| L.2, L.5, L.6, L.7, L.8, L.9 | Pass (L.8 and L.9 after fixes in 5b4bb96) |
| D3.1 (approve, remove), D3.4, D6.2, D6.4, D7.1, D7.4 | Pass, new pages |
| D5.3, D5.5, D8.2 | Pass, *old pages* |
| S.3 (W1 only), S.5 | Pass (S.5 after the reconnect fix in 2c67453) |
| G.1, G.5, G.6, G.8, A.4 | Pass, checked without transactions |

## Reporting

For each failure note the case number, the wallet, the project address, the
page and what you saw (a screenshot with the toast), and the transaction link
if one was sent.

## Coverage of DASHBOARD_TESTING.md

Every case in the fund dashboard's plan, and where it is here.

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
P.1–P.3, G.8–G.10, D1.5, D2.5, D2.6, D3.8, D5.6, D11.2, A.1–A.4, and the
site checks before mainnet.

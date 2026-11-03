# Sample investor disclosures

Draft, Nov 3, 2026 · sample text for counsel · not legal advice

This is starting text for the wallet pages in [WALLET_PLAN.md](WALLET_PLAN.md).
Counsel writes each offering's private placement memorandum (PPM) and reviews
this text against it. The PPM and subscription agreement control. Text marked
**[check PPM]** depends on terms only the PPM settles.

Each client's text goes in their editor under Site settings → Investor
disclosures. These `{placeholders}` are filled in on the page:

| Placeholder | Becomes |
|---|---|
| `{company}` | The company name in Investor disclosures |
| `{project}` | The listing's title |
| `{network}` | The network's name, e.g. "BNB Smart Chain Testnet" |
| `{wallet}` | The connected wallet, shortened. In "Not approved yet", `{wallet}` on a line of its own is the full address with a copy button |
| `{class}` | US or International |
| `{rate}` | The investor's rate, as a number: write `{rate}% per cycle` |
| `{cycle}` | The cycle length, e.g. "30 days" |
| `{fee}` | The management fee rate, as a number: write `{fee}%` |
| `{amount}`, `{token}` | The amount being invested and the token, e.g. "10,000" and "USDT" |

`[PPM date]` and `[liquidity pool]` below aren't filled in by the site: type
them in. Formatting is plain text: a blank line starts a paragraph, a line
starting with "- " is a bullet, and `**bold**` is bold.

This repo is public, so it only ever holds this generic sample. Each client's
approved text lives in that client's content repo.

## Where each piece appears

| # | Piece | Where |
|---|---|---|
| 1 | Test network banner | Every wallet page, while `chainId` is a testnet. Leave it empty for the standard text below |
| 2 | Listing notice | Under the invest panel on every linked listing |
| 3 | Site footer line | The footer notice box (Branding & layout → Footer), on every page |
| 4 | Not approved yet | Listing, when the connected wallet isn't approved for the project |
| 5 | Risk summary | Before an investor's first deposit in each project |
| 6 | Acknowledgments | Before an investor's first deposit in each project, all required |
| 7 | Deposit confirmation | Every deposit, above the confirm button |

**The site records nothing.** It has no backend and collects no names or
contact details, so the checked boxes aren't stored anywhere. The investor's
signed subscription agreement is the record. The site's text repeats its key
terms where the money moves.

**Rates always say "per cycle"**, with the cycle length beside them ("1 cycle
= 30 days"), and are never converted to a month or a year.

## For counsel

- **A public listing page is probably general solicitation.** In the US that
  usually means Rule 506(c): accredited investors only, with reasonable steps
  to verify their status, rather than 506(b). **[check PPM]**
- **International investors** are usually offered under Regulation S, which
  restricts directed selling efforts in the US. The listing may need to say
  who the International class is for. **[check PPM]**
- **Restricted countries and sanctions** need a list. The contract can't
  enforce geography. Only the Manager's review of the subscription documents
  before approval can.
- **Contract terms that investors don't see in most offerings:** no early
  withdrawal, repayment strictly oldest deposit first, interest paid only when
  payments are processed, a position that can never move from the depositing
  wallet, and payments in USDT. Each is covered below. The PPM should say the
  same.

## 1. Test network banner

> **Test network.** This project runs on {network}, a test network.
> Tokens here have no value and no real investment is made.

## 2. Listing notice

> {company} offers interests in {project} only to eligible investors, under its
> Private Placement Memorandum dated [PPM date]. This page is a summary. It
> isn't an offer to sell, or a request for an offer to buy, any security.
> Investing involves risk, including losing your whole investment. Your money
> is locked until it's repaid, with no early withdrawal. Read the PPM before
> you invest.

## 3. Site footer line

> Investments on this site are offered only to eligible investors, through
> each project's PPM. Nothing here is an offer where one would be unlawful.
> [Company] isn't a registered broker-dealer or investment adviser. **[check
> PPM: keep only if true]**

## 4. Not approved yet

> **This wallet isn't approved for {project} yet.** To invest, include this
> wallet address in your subscription documents:
>
> {wallet}
>
> You can invest here once {company} has reviewed your documents and approved
> the wallet. Approval is for this project only.

## 5. Risk summary

Shown above the acknowledgments, with a link to the PPM's risk factors.

> **Before you invest, understand the risks.** The PPM describes them in full.
>
> - **You can lose your whole investment.**
> - **Your money is locked.** There's no early withdrawal. You're repaid in
>   order, oldest deposit first, when the repayment fund can cover your whole
>   deposit, so your repayment date isn't guaranteed.
> - **Interest can be late.** Interest is paid when payments are processed,
>   not automatically, and it waits if the project's interest reserve runs
>   short.
> - **Real estate risk.** Delays, cost overruns, falling property values and
>   financing problems can reduce or stop payments.
> - **Your wallet is your only access.** Your position stays with the wallet
>   you deposit from. It can't be transferred, and nobody, including
>   {company}, can recover it if you lose access.
> - **Smart contract risk.** The project's contracts can have errors and can't
>   be changed once deployed.
> - **USDT risk.** You invest and are paid in USDT, whose issuer can freeze
>   wallets and whose value can move away from one US dollar.
> - **Pool risk.** Deposits are placed in [liquidity pool], whose returns help
>   pay interest. That pool can lose value or pause withdrawals. **[check
>   PPM]**
> - **Fees and conflicts.** {company} and its affiliates receive a management
>   fee of {fee}% of principal per cycle, and development funds from project
>   earnings. **[check PPM]**
> - **Rules and taxes can change,** and you're responsible for your own taxes.

## 6. Acknowledgments

Every box must be checked before the first deposit in a project.

> - [ ] I've read the PPM for {project} and signed its subscription agreement.
>   If anything on this site differs from them, they control.
> - [ ] I'm investing as a {class} investor, as set out in my
>   subscription documents.
> - [ ] I can afford to lose my whole investment.
> - [ ] My money is locked until it's repaid, with no early withdrawal, and
>   repayment comes oldest deposit first.
> - [ ] My interest rate is {rate}% per cycle (1 cycle = {cycle}), simple
>   interest on my principal, fixed when I deposit. It's paid when payments
>   are processed, not automatically, and it can be late.
> - [ ] My position stays with this wallet. It can't be transferred, all
>   payments go to this wallet, and nobody can recover it if I lose access.
> - [ ] Deposits are final once confirmed on {network}. I can't cancel or
>   reverse them.
> - [ ] Nothing on this site is investment, legal or tax advice.

## 7. Deposit confirmation

> You're investing **{amount} {token}** in {project} from {wallet}, at
> {rate}% per cycle. It's locked until repaid and can't be moved to another
> wallet. This can't be undone.

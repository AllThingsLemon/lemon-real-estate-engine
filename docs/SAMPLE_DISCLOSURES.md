# Sample investor disclosures

Draft, Nov 2, 2026 · sample text for counsel to review · not legal advice

This is starting text for the wallet pages in [WALLET_PLAN.md](WALLET_PLAN.md).
Every client's counsel must review it and make it match that offering's
private placement memorandum (PPM) and subscription agreement. Those
documents control. Words in `{braces}` are filled in per client or per
project. Text marked **[check PPM]** depends on terms only the PPM can confirm.

This repo is public, so it only ever holds this generic sample. Each client's
approved text lives in that client's content repo.

## Where each piece appears

| # | Piece | Where | Recorded? |
|---|---|---|---|
| 1 | Test network banner | Every wallet page, while `chainId` is a testnet | No |
| 2 | Listing notice | Under the invest panel on every linked listing | No |
| 3 | Site footer line | Footer of sites with a `fund` block | No |
| 4 | Eligibility | "Request access" form | Signed (see below) |
| 5 | Risk summary | Before the acknowledgments | No |
| 6 | Acknowledgments | "Request access" form, once per project | Signed (see below) |
| 7 | Deposit confirmation | Every deposit, above the confirm button | No |

**How acceptance is recorded without a backend.** When the investor sends the
access request, the wallet signs a plain-text message: the project, the
wallet, the investor type, the statements they checked, the text version and
the date. Signing is free and sends no transaction. The signature goes in the
request email, so the Manager can file it with the subscription documents, and
the prefilled approval link lets the manage page check that the signature
came from that wallet. The signature records what the investor confirmed. It
doesn't replace the signed subscription agreement.

## For counsel

- **A public listing page is probably general solicitation.** In the US that
  usually means Rule 506(c): accredited investors only, with reasonable steps
  to verify their status, rather than 506(b). **[check PPM]**
- **International investors** are usually offered under Regulation S, which
  restricts directed selling efforts in the US. The site may need to gate the
  International flow, or show it only after the investor confirms they're
  outside the US. **[check PPM]**
- **Restricted countries and sanctions** need a list. The contract can't
  enforce geography. Only the Manager's review before approval can.
- **Contract terms that investors don't see in most offerings:** no early
  withdrawal, repayment strictly oldest deposit first, interest paid only when
  payments are processed, a position that can never move from the depositing
  wallet, and payments in USDT. Each is covered below. The PPM should say the
  same.

## 1. Test network banner

> **Test network.** This project runs on {network name}, a test network.
> Tokens here have no value and no real investment is made.

## 2. Listing notice

> {Company} offers interests in {Project} only to eligible investors, under its
> Private Placement Memorandum dated {PPM date}. This page is a summary. It
> isn't an offer to sell, or a request for an offer to buy, any security.
> Investing involves risk, including losing your whole investment. Your money
> is locked until it's repaid, with no early withdrawal. Read the PPM before
> you invest.

## 3. Site footer line

> Investments on this site are offered only to eligible investors, through
> each project's PPM. Nothing here is an offer where one would be unlawful.
> {Company} isn't a registered broker-dealer or investment adviser. **[check
> PPM: keep only if true]**

## 4. Eligibility

Investor type, choose one:

> **US investor.** I'm an accredited investor as defined in Rule 501(a) of
> Regulation D under the US Securities Act of 1933. I understand {Company}
> will verify my status before approving this wallet. **[check PPM]**

> **International investor.** I'm not a US person as defined in Regulation S.
> I'm not investing for the account or benefit of a US person, and investing
> is lawful where I live. **[check PPM]**

Always:

> I don't live in, and I'm not investing from, {restricted countries}. I'm not
> on any sanctions list, including the US Treasury's OFAC list.

> I control this wallet and I'm investing for myself, or for {entity}, which
> I'm authorized to represent.

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
>   {Company}, can recover it if you lose access.
> - **Smart contract risk.** The project's contracts can have errors and can't
>   be changed once deployed.
> - **USDT risk.** You invest and are paid in USDT, whose issuer can freeze
>   wallets and whose value can move away from one US dollar.
> - **Pool risk.** Deposits are placed in {liquidity pool}, whose returns help
>   pay interest. That pool can lose value or pause withdrawals. **[check
>   PPM]**
> - **Fees and conflicts.** {Company} and its affiliates receive a management
>   fee of {fee}% of principal every {cycle}, and development funds from
>   project earnings. **[check PPM]**
> - **Rules and taxes can change,** and you're responsible for your own taxes.

## 6. Acknowledgments

Every box must be checked before the request can be sent. These are the
statements the wallet signs.

> - [ ] I've received and read the PPM and the subscription agreement for
>   {Project}, and I've signed the subscription agreement. If anything on this
>   site differs from them, they control.
> - [ ] I can afford to lose my whole investment.
> - [ ] My money is locked until it's repaid, with no early withdrawal, and
>   repayment comes oldest deposit first.
> - [ ] My interest rate is {rate}% every {cycle} on my principal, simple
>   interest, fixed when I deposit. It's paid when payments are processed, not
>   automatically, and it can be late.
> - [ ] My position stays with this wallet. It can't be transferred, all
>   payments go to this wallet, and nobody can recover it if I lose access.
> - [ ] Deposits are final once confirmed on {network name}. I can't cancel or
>   reverse them.
> - [ ] Nothing on this site is investment, legal or tax advice.

## 7. Deposit confirmation

> You're investing **{amount} USDT** in {Project} from {wallet, short}. It's
> locked until repaid and can't be moved to another wallet. This can't be
> undone.

## Message the wallet signs

```
{Company}: access request for {Project}
Contract: {project address} ({network name}, chain {chainId})
Wallet: {wallet}
Investor type: {US accredited | International}
Disclosures version: {version}
Date: {ISO date, UTC}

I confirm each statement I checked on {site URL}:
- {each acknowledgment, as worded above}
```

When counsel changes any of the text, the version number goes up, so every
signature shows which wording the investor saw.

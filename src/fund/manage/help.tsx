// What every page, section, figure and action on /manage/ is for: the text of
// the tooltips and ⓘ buttons, in one place so the wording stays consistent.
// Plain words, the site's vocabulary ("repayment fund", "pool"), and what
// happens on-chain when it matters.
import type { ReactNode } from 'react';
import type { Section } from './view';

export const PAGE_HELP: Record<Section, string> = {
  overview: 'What needs doing now, the headline figures, where the money is, and the latest activity.',
  raise: 'How much is raised, placing principal in the pool, the investor allowlist, deposits made off the site, and stopping or closing the raise.',
  investors: 'Every investor, with what they have in, the interest paid to them and what needs attention.',
  earnings: 'The pool account and its earnings, paying investors their interest, and the reserves that protect those payments.',
  surplus: 'Splitting earnings, withdrawing development funds, and buying LEMX with money set aside for it.',
  repayment: 'The line of deposits waiting to be repaid, adding repayment money, and principal coming back from the pool.',
  activity: 'Everything that happened on this project, newest first, with a link to each transaction.',
  settings: 'Who holds each role, the payout wallets, ownership, pausing, and the project’s fixed terms.',
};

export const HEALTH_HELP = (
  <>
    <strong>On track:</strong> investors are paid up and the reserves are full. <strong>Payments due:</strong> a cycle has come due and Pay investors hasn't run yet. <strong>Needs attention:</strong> a reserve is below its target or fees are deferred. <strong>Late:</strong> a payment is waiting for money, or a matured deposit isn't repaid. <strong>Fully repaid:</strong> every deposit has been repaid.
  </>
);

export const FLAG_HELP: Record<string, string> = {
  paused: 'Paused: new deposits and development withdrawals are stopped. Investor payments, collections and repayments carry on.',
  killed: 'Deposits stopped: an admin has stopped new investor deposits. It can be undone on the Raise page.',
  closed: 'Raise closed: the raise ended early and can never reopen.',
  filled: 'Fully raised: the raise reached its cap, so no more deposits are taken.',
  compounding: 'Buying LEMX: a LEMX purchase is running. See Surplus & development.',
};

export const H = {
  // Project list and header
  projects: 'This site’s projects: every project a listing links to, and every project its trusted owners created and own, even before a listing links to it. “Your projects” are the ones where your wallet holds a role or has a handover waiting; “All” shows every one.',
  unlisted: 'No listing links to this project yet, so investors can’t find it on the site. Only /manage/ shows it. Link it to a listing in the editor.',
  editListing: 'Opens this project’s listing in the editor, in a new tab: its text, photos and Key figures. You sign in to the editor with GitHub. The on-chain terms can’t be changed.',
  newProject: 'Creates a project contract owned by one of this site’s trusted owners. Only they see this button.',
  sync: 'Lists and history (the allowlist, payment histories, Activity, role holders) come from the fund indexer and can lag by a few seconds. Balances and actions always read the chain directly.',
  roles: 'What your connected wallet can do here. Buttons that need a role you don’t hold say so instead of sending.',

  // Overview
  attention: 'Things to do, most urgent first. Red items are late or waiting on money; arrows are ready to do; “i” items are for your information. Buttons here need no role unless they say so.',
  raised: 'Investor principal taken in so far, against the raise cap.',
  outstanding: 'Principal still owed to investors (not yet repaid), and how much of the project’s money is lent in the pool.',
  perCycle: 'What the project owes every cycle: interest to investors plus the management fee.',
  payments: 'Whether interest is paid up. “Due now” means a cycle has come due and Pay investors needs to run. “Waiting for money” means the reserves can’t cover the next payment.',
  money: (
    <>
      Every token the project holds, by purpose:
      <ul>
        <li><strong>Interest reserve:</strong> pays investor interest; target two cycles.</li>
        <li><strong>Management reserve:</strong> pays the management fee.</li>
        <li><strong>Earnings:</strong> left over for the manager to split.</li>
        <li><strong>Repayment fund:</strong> repays principal, first in, first out.</li>
        <li><strong>Development funds:</strong> can be withdrawn to the company wallet.</li>
        <li><strong>Set aside for LEMX:</strong> waiting to buy LEMX.</li>
        <li><strong>Principal waiting to be placed:</strong> raised but not yet lent into the pool.</li>
      </ul>
    </>
  ),
  reserves: 'Each reserve against its target. Pool earnings and added money fill the interest reserve first, then the management reserve.',
  terms: 'The interest rates each investor type earns per cycle, fixed when the project was created.',
  termsOne: 'The interest rate investors earn per cycle, fixed when the project was created.',
  maturities: 'The next deposits to reach the end of their term. After maturity a deposit is repaid from the repayment fund, or renewed.',
  recent: 'The latest events on the project. All of them are on the Activity page.',

  // Raise
  raiseProgress: 'Principal raised so far, what’s left before the cap, the minimum investment, and whether deposits are being taken.',
  deploy: 'Raised principal earns only once it’s lent into the Loans liquidity pool. It’s locked there for the project’s pool term, then comes back on the Repayment page.',
  poolMinimum: 'The smallest amount the pool accepts in one go. Less than this waits until more is raised.',
  allowlist: 'Only approved wallets can invest. The investor type (US or International) sets the interest rate on their future deposits; existing deposits keep their rate.',
  investorTypeOne: 'Every investor earns the same rate on this project. Removing a wallet stops new deposits; its existing deposits are unaffected.',
  investorType: 'US and International investors earn different rates per cycle. Removing a wallet stops new deposits; its existing deposits are unaffected.',
  referrer: 'Optional. The wallet that referred this investor, recorded on-chain with their approval.',
  credited: 'For an investment paid off the site (a wire, say). The investor is credited the full principal, while you pay in the tokens actually received after fees. The credit can exceed what’s received by at most the project’s premium.',
  principalCredited: 'What the investor is owed back and earns interest on.',
  paidIn: 'Taken from your wallet now. Your wallet is asked to allow this amount first if it hasn’t already.',
  raiseControls: 'Stopping deposits blocks new investments and can be undone. Closing the raise is permanent. Neither affects interest or repayments.',

  // Investors
  investorsCount: 'Investors with money in now, and how many wallets are approved.',
  interestPaidTotal: 'All interest paid to investors so far, by investor type.',
  interestPaidTotalOne: 'All interest paid to investors so far.',
  principalRepaid: 'Principal paid back to investors so far.',
  positions: 'One row per investor. Open a row for their deposits, renewals and payment history.',
  filterAttention: 'Investors with interest due, or a deposit past maturity and not yet repaid.',
  depositsCol: 'Open deposits / all deposits this investor has made.',
  statusCol: 'Interest due: a cycle is owed. Matured: past its term and not repaid. Current: paid up. Repaid: all principal returned. Approved: on the allowlist, no deposits yet.',

  // Investor detail
  investorDeposits: 'Each of this investor’s deposits, read live from the chain: its rate, cycles paid, when the next payment falls due, and its maturity.',
  renewal: 'Renewing extends a deposit once, by the renewal term, starting from the later of its maturity and now. The Company wallet pays the investor the renewal fee. Its interest has to be paid up first.',
  history: 'Deposits, interest payments, repayments and renewals for this investor, newest first.',

  // Earnings
  poolAccount: 'The project’s principal is an account in the Loans liquidity pool, which earns from lending. Collecting moves those earnings into the project.',
  toCollect: 'Earnings the pool has made for the project that haven’t been collected yet.',
  collected: 'Everything collected from the pool so far.',
  locked: 'Principal in the pool that is still within its lock.',
  unlocked: 'Principal whose pool lock has ended. Request it on the Repayment page.',
  investorPayments: 'Interest and management fees are paid per deposit, oldest first, whenever someone runs Pay investors. Nothing is paid automatically on the due date.',
  reservesCard: 'The interest reserve holds two cycles of interest and the management reserve one cycle of fees, so a slow month doesn’t stop payments. Earnings back them up.',
  addMoney: 'Company money to cover payments. It fills the interest reserve, then the management reserve and any deferred fees; whatever is left becomes earnings.',
  fundBucket: 'Puts money straight into one part of the project. A reserve above its target passes the extra on into earnings.',
  balances: 'How the interest reserve, earnings and repayment fund have moved over time.',
  paymentsFeed: 'Interest and fee payments, deferred fees, pool collections and added money, newest first.',

  // Surplus
  split: 'Shares out the earnings: early repayment of investors (first in, first out), development funds the company can withdraw, and money to buy LEMX. Only possible while investors are paid up.',
  devFunds: 'Company money set aside by splits. It can be withdrawn to the company wallet once investors are paid up, no fees are deferred and the project isn’t paused.',
  lemx: 'Buys LEMX with the money set aside for it, in slices over time, at or above a floor price, then locks the LEMX in the pool.',
  floor: 'The lowest price a slice will fill at, in LEMX per token. Slices priced below it are skipped. Lowering it lets slices fill when the market moves.',
  startingFloor: 'Where a new purchase’s floor starts: the price feed’s market price, less the project’s slippage allowance.',

  // Repayment
  repaymentLine: 'Principal is repaid strictly in deposit order, first in, first out, from the repayment fund. A deposit can be repaid before it matures whenever the fund covers it.',
  fundNeeded: 'How much the repayment fund needs to repay every deposit up to and including this one.',
  addRepayment: 'Property income or sale proceeds for repaying investors’ principal. It goes straight to the repayment fund. Sent by an Operations wallet, it’s recorded as from Operations.',
  poolPrincipal: 'When the pool lock ends, principal is withdrawn back into earnings in two steps: request it, then claim it once the pool has funded the withdrawal (it may be lent out).',

  // Activity
  activityFilters: 'Narrow the list to one kind of event.',

  // Settings
  team: 'Roles are per project. The owner gives and removes them; anyone can give up their own.',
  checkWallet: 'Without the indexer there’s no list of role holders, so check a wallet’s roles here instead. It reads the chain.',
  wallets: 'Where money leaves the project. A change takes two steps: an admin proposes a wallet, then the current wallet accepts it.',
  ownership: 'The owner gives every other role. Handing over takes two steps: the owner offers it, then the new wallet accepts. Accepting removes every role the old owner held.',
  pause: 'Pausing stops new deposits and development withdrawals only. Investor interest, collections and repayments keep running.',
  projectTerms: 'Fixed when the project was created. Projects can’t change their terms.',
} satisfies Record<string, ReactNode>;

/** What each role can do, for the team cards. */
export const ROLE_HELP = {
  OWNER_ROLE: 'Gives and removes every other role. One wallet, handed over in two steps.',
  ADMIN_ROLE: 'Stops or resumes deposits, pauses, closes the raise, proposes new payout wallets.',
  MANAGER_ROLE: 'Approves investors, splits earnings, withdraws development funds, buys LEMX.',
  OPERATIONS_ROLE: 'Records deposits made off the site. Its repayment money is recorded as from Operations.',
  COMPANY_ROLE: 'Renews deposits, paying the investor the renewal fee.',
} as const;

/** What each button does. */
export const DO = {
  // Quick actions (Needs attention) and their full forms
  payInvestors: 'Pays every cycle that’s due, oldest deposit first, in as many transactions as it takes. Stops if a payment has to wait for money. Any wallet can run it.',
  sweep: 'Collects the pool’s earnings into the project: the interest reserve first, then the management reserve, then earnings. Sends a small BNB fee to the pool.',
  deployPrincipal: 'Lends the principal waiting to be placed into the pool, where it earns. Sends a small BNB fee to the pool; any extra comes back.',
  payoffNext: 'Repays the next deposit in line from the repayment fund, paying its due interest first.',
  finalizeCompound: 'Collects the LEMX bought and locks it in the pool, or holds it while it’s below the pool’s minimum. Sends a small BNB fee to the pool.',
  depositHeldLemx: 'Locks LEMX left over from a finished purchase in the pool, once it reaches the pool’s minimum.',
  requestMaturedPrincipal: 'Asks the pool to return principal whose lock has ended. Claim it once the pool funds the withdrawal.',
  claimLpWithdrawal: 'Collects a funded pool withdrawal into earnings. Sends a small BNB fee to the pool.',
  acceptOwnership: 'Makes your wallet the project owner. The previous owner loses all their roles.',
  acceptCompanyWallet: 'Hands the company wallet role to the proposed wallet. Only the current company wallet can accept.',
  acceptMgmtFeeWallet: 'Hands the management fee wallet role to the proposed wallet. Only the current fee wallet can accept.',

  approve: 'Adds the wallet to the allowlist with this investor type, so it can invest.',
  saveInvestor: 'Changes this investor’s type (and referrer). Their existing deposits keep their rate.',
  removeInvestor: 'Takes the wallet off the allowlist, so it can’t invest again. Its existing deposits are unaffected.',
  changeInvestor: 'Loads this investor into the form above to change their type or remove them.',
  record: 'Records the deposit: the investor is credited the principal, and the tokens paid in are taken from your wallet.',
  stopDeposits: 'Stops new investor deposits and recorded deposits until resumed. Payments carry on.',
  resumeDeposits: 'Lets investors deposit again.',
  closeRaise: 'Ends the raise for good at the amount raised so far. It can never reopen.',
  renew: 'Extends this deposit once by the renewal term. Your wallet pays the investor the renewal fee shown.',
  addMoney: 'Adds the amount to the project’s reserves and earnings. Your wallet is asked to allow it first.',
  fundBucket: 'Adds the amount straight to the chosen bucket. Your wallet is asked to allow it first.',
  split: 'Moves these amounts out of earnings into the repayment fund, development funds and LEMX.',
  useRest: 'Fills in whatever earnings are left after the other two amounts.',
  withdrawDev: 'Sends this amount of development funds to the company wallet.',
  startLemx: 'Starts buying LEMX with all the money set aside for it, in slices over time.',
  lowerFloor: 'Lowers the floor price so more slices can fill. It can only go down.',
  cancelLemx: 'Stops the purchase. What hasn’t been swapped goes back to the money set aside for LEMX; LEMX already bought is locked in the pool, or held while it’s below the pool’s minimum.',
  repay: 'Repays the next deposit in line from the repayment fund, paying its due interest first. Any wallet can run it.',
  addRepayment: 'Adds the amount to the repayment fund. Your wallet is asked to allow it first.',
  requestPrincipal: 'Asks the pool to return the principal whose lock has ended.',
  claim: 'Collects this funded withdrawal into earnings.',
  grant: 'Gives the role to this wallet on this project.',
  revoke: 'Takes the role away from this wallet.',
  leave: 'Gives up this role on your own wallet. Only the owner can give it back.',
  propose: 'Proposes the new wallet. Nothing changes until the current wallet accepts.',
  acceptWallet: 'Accepts the proposed wallet in place of yours.',
  transfer: 'Offers ownership to the new wallet. Nothing changes until it accepts.',
  pause: 'Pauses new deposits and development withdrawals.',
  resume: 'Ends the pause.',
  loadOlder: 'Shows earlier events.',
  copy: 'Copies the full address.',
  connect: 'Connect a wallet to act.',
} as const;

/** The New project page's ⓘ text (Create.tsx). */
export const CREATE_HELP = {
  project: 'The name identifies the project on /manage/ until a listing links to it. Both are recorded on-chain with the project and can’t be changed.',
  raise: 'The raise cap is the most investor principal the project can ever take, counting deposits already repaid. The factory allows at most 80% of the valuation.',
  rates: 'Interest is paid every cycle on each deposit’s principal, at the rate for the investor’s type, fixed for good when the project is created. The management fee is charged every cycle too; the renewal fee once per renewed deposit.',
  term: 'Each deposit has to be repaid within the term after it’s made. The company can renew a deposit once, adding the renewal extension, for the renewal fee.',
  pool: 'Raised principal earns in the Loans liquidity pool, locked for the period chosen. Earnings set aside for LEMX buy it in slices, at most the slippage below the price feed, and lock it in the pool.',
  wallets: 'The owner holds every role and gives the others out on the project’s Settings page. The company wallet receives development funds, the fee wallet the management fee. Each can be handed over later.',
  review: 'The factory checks these terms first (validateParams), so a mistake shows here instead of in your wallet. Creating the project is one transaction from your wallet.',
  create: 'Creates the project’s contract from your wallet. Its terms can’t be changed afterwards.',
  listing: 'A listing is the project’s public page. The editor is the only place listings are written, so the link is made there.',
} as const;

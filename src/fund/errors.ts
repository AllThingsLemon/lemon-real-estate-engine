// Plain-English messages for every Project error (docs/WALLET_PLAN.md, "Error
// messages") and for the wallet and network failures around them.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, keccak256, toHex } from 'viem';

const ROLES = ['OWNER_ROLE', 'ADMIN_ROLE', 'MANAGER_ROLE', 'OPERATIONS_ROLE', 'COMPANY_ROLE'] as const;
const ROLE_NAMES: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [keccak256(toHex(r)), r.replace('_ROLE', '').toLowerCase()]),
);

type Args = readonly unknown[];

const MESSAGES: Record<string, (a: Args, f: (v: unknown) => string) => string> = {
  AddressZero: () => 'An address is missing.',
  AlreadyRenewed: () => 'This deposit has already been renewed.',
  AlreadyRepaid: () => 'This deposit has already been repaid.',
  BelowLpMinimum: () => "There isn't enough principal waiting to place in the pool yet.",
  BelowMinimumDeposit: () => 'This is below the minimum investment.',
  CompoundInFlight: () => 'A LEMX purchase is already in progress.',
  CompoundNotFinished: () => "The LEMX purchase hasn't finished yet.",
  ExceedsBalance: () => "That's more than is available.",
  ExceedsNetEarnings: () => "That's more than the earnings available to split.",
  ExceedsRaiseCap: () => "That's more than is left in this raise.",
  FloorNotLower: () => 'The new floor price must be lower than the current one.',
  InsufficientPayoffPool: (a, f) => `The repayment fund has ${f(a[1])} of the ${f(a[0])} needed.`,
  InterestNotCurrent: (a) => `Deposit #${a[0]} has interest owed. Pay it first.`,
  InvalidAmount: () => 'Enter an amount greater than zero.',
  InvalidCredit: () => "The credited amount isn't allowed for the USDT received.",
  InvalidDeposit: () => "That deposit doesn't exist.",
  MissingRole: (a) => `This wallet doesn't have the ${ROLE_NAMES[String(a[0])] ?? 'needed'} role on this project.`,
  NativeTransferFailed: () => "The BNB fee refund couldn't be sent.",
  NoCompoundInFlight: () => 'No LEMX purchase is in progress.',
  NotApprovedInvestor: () => "This wallet isn't approved for this project yet.",
  NotCurrentWallet: () => 'Only the current wallet can accept this change.',
  NotPendingOwner: () => "This wallet isn't the pending owner.",
  NothingToPayOff: () => 'There are no deposits left to repay.',
  NothingUnlocked: () => 'Nothing has unlocked in the pool yet.',
  OlderPaymentWaiting: (a) => `Payments go oldest first, and deposit #${a[0]} is still waiting.`,
  OwnerRoleViaTransferOnly: () => 'Ownership can only move by transferring it.',
  PaymentsLate: () => 'Investors are owed interest. Bring payments up to date first.',
  ProjectIsKilled: () => 'Deposits are stopped for this project right now.',
  ProjectNotOpen: () => 'This raise is closed or fully funded.',
  ProjectPaused: () => 'This project is paused. Deposits will reopen when it resumes.',
  ProjectRepaid: () => 'This project is fully repaid.',
};

/** The message for a failed call, transaction or wallet request. `amount` formats token amounts. */
export function explain(e: unknown, amount: (v: unknown) => string = String): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You cancelled in your wallet.';
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name](revert.data?.args ?? [], amount);
      // Token reverts carry no reason (their revert strings are stripped).
      return "The transaction would fail. Check your balance and that you've allowed the amount.";
    }
    if (/insufficient funds/i.test(e.message)) return "This wallet doesn't have enough BNB for the network fee.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

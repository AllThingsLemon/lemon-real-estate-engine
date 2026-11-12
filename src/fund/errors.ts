// Plain-English messages for every Project and ProjectFactory error
// (docs/WALLET_PLAN.md, "Error messages") and for the wallet and network
// failures around them.
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, parseAbi } from 'viem';
import { ROLE_NAME_BY_ID } from './roles';

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
  InvalidParam: () => 'One of the terms is outside what the factory allows.',
  LockTierNotEnabled: () => "The pool doesn't offer that lock period. Choose one of the periods listed.",
  MissingRole: (a) => `This wallet doesn't have the ${ROLE_NAME_BY_ID[String(a[0])] ?? 'needed'} role on this project.`,
  NativeTransferFailed: () => "The BNB fee refund couldn't be sent.",
  NoCompoundInFlight: () => 'No LEMX purchase is in progress.',
  NotApprovedInvestor: () => "This wallet isn't approved for this project yet.",
  NotCurrentWallet: () => 'Only the current wallet can accept this change.',
  NotPendingOwner: () => "This wallet isn't the pending owner.",
  NothingToPayOff: () => 'There are no deposits left to repay.',
  NothingUnlocked: () => 'Nothing has unlocked in the pool yet.',
  OlderPaymentWaiting: (a) => `Payments go oldest first, and deposit #${a[0]} is still waiting.`,
  OwnerRoleViaTransferOnly: () => 'Ownership can only move by transferring it.',
  PaymentsLate: () => 'Payments have to be up to date first: interest owed to investors and, for development withdrawals, any deferred management fees.',
  ProjectIsKilled: () => 'Deposits are stopped for this project right now.',
  ProjectNotOpen: () => 'This raise is closed or fully funded.',
  ProjectPaused: () => 'This project is paused. Deposits will reopen when it resumes.',
  ProjectRepaid: () => 'This project is fully repaid.',
  RaiseCapAboveLimit: (a, f) => `The raise cap has to be more than zero and at most 80% of the valuation (${f(a[1])}).`,
};

/**
 * Errors from the pool, the token and the sandbox mocks, which come back
 * through the project's calls but aren't in its ABI. The sandbox pool
 * reverts Reverted("<name>") with the real pool's error names. Every pool
 * error is listed so it's named, not mistaken for a missing allowance.
 */
const OTHER_ERRORS = parseAbi([
  'error WithdrawalNotFullyFunded()',
  'error WithdrawalAlreadyClaimed()',
  'error WithdrawalRequestNotFound()',
  'error InsufficientUnlocked()',
  'error InsufficientNativeFee()',
  'error NativeFeeTransferFailed()',
  'error NoEarningsAvailable()',
  'error NoPriceAvailable()',
  'error SweepRequired()',
  'error AssetNotSupported()',
  'error LockDurationNotAvailable()',
  'error UtilizationBelowThreshold()',
  'error NotRequestOwner()',
  'error ActiveBoostsPending()',
  'error Unauthorized()',
  'error Reverted(string why)',
  'error BelowFloor(uint256 price, uint256 minPrice)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
]);

const OTHER_MESSAGES: Record<string, string> = {
  WithdrawalNotFullyFunded: "The pool hasn't funded this withdrawal yet.",
  WithdrawalAlreadyClaimed: 'This withdrawal has already been claimed.',
  WithdrawalRequestNotFound: "The pool has no such withdrawal request.",
  InsufficientUnlocked: "The pool doesn't have that much unlocked principal.",
  InsufficientNativeFee: 'The BNB fee sent was too low, because the BNB price moved. Try again.',
  NoEarningsAvailable: 'There are no pool earnings to collect.',
  SweepRequired: 'The pool has to process its earnings before they can be collected. Try again later.',
  NoPriceAvailable: "The pool's price feed has no price right now. Try again later.",
  BelowFloor: 'LEMX is priced below the floor right now.',
  ERC20InsufficientBalance: "This wallet doesn't have enough of the token.",
  ERC20InsufficientAllowance: "The project isn't allowed to take that much of the token yet.",
};

/** The name of an error the project's ABI couldn't decode, from its raw data. */
export function otherErrorName(raw: `0x${string}` | undefined): string | null {
  if (!raw) return null;
  try {
    const d = decodeErrorResult({ abi: OTHER_ERRORS, data: raw });
    return d.errorName === 'Reverted' ? String(d.args[0]) : d.errorName;
  } catch {
    return null;
  }
}

/**
 * Whether a simulated call failed only because the project can't take the
 * token yet: the token's own allowance error, or a token revert with no name
 * (a revert string or none). A named refusal (a role, the cap, late
 * payments, a short balance) is real, and shows before any approval.
 */
export function isAllowanceRefusal(e: unknown): boolean {
  const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  if (!(revert instanceof ContractFunctionRevertedError)) return false;
  const name = revert.data?.errorName;
  if (name && name !== 'Error') return false;
  const other = otherErrorName(revert.raw);
  return !other || other === 'ERC20InsufficientAllowance';
}

/** Why an action that calls the Loans pool can't run now. */
export const POOL_PAUSED = 'The Loans pool is paused. This waits until it resumes.';
/** A call that failed without a reason while the pool is paused: the Loans contracts carry no revert strings. */
export const POOL_PAUSED_FAILED = 'The Loans pool is paused, which is likely why. Try again once it resumes.';

/**
 * The message for a failed call, transaction or wallet request. `amount`
 * formats token amounts; `noReason` replaces the balance-and-allowance guess
 * for a call that fails without a reason, when the caller knows a likelier cause.
 */
export function explain(e: unknown, amount: (v: unknown) => string = String, noReason?: string): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You cancelled in your wallet.';
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name](revert.data?.args ?? [], amount);
      const other = otherErrorName(revert.raw);
      if (other) return OTHER_MESSAGES[other] ?? `The pool refused it (${other}).`;
      // A plain revert string, like a BEP20 token's. With no revert data the
      // "reason" is only the node's "execution reverted", which says nothing.
      if (revert.reason && revert.raw && revert.raw !== '0x') return `Refused: ${revert.reason}.`;
      // Token reverts can carry no reason at all (revert strings stripped).
      return noReason ?? "The transaction would fail. Check your balance and that you've allowed the amount.";
    }
    if (/insufficient funds/i.test(e.message)) return "This wallet doesn't have enough BNB for the network fee.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

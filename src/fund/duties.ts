// What a wallet has to do with a project: its roles and any handover
// waiting on it. Shared by the header's Manage link and /manage/.
import type { Roles } from './queries';
import { ROLE_LABEL } from './roles';

/** The wallet's roles and handovers on a project, or null when it has nothing to do there. */
export function duties(r: Roles | undefined | null): string[] | null {
  if (!r) return null;
  const parts = [...(r.isOwner ? ['Owner'] : []), ...r.roles.map((x) => ROLE_LABEL[x])];
  if (r.isPendingOwner) parts.push('Ownership offered to you');
  if (r.isCompanyWallet && r.pendingCompanyWallet) parts.push('Company wallet handover');
  if (r.isFeeWallet && r.pendingMgmtFeeWallet) parts.push('Fee wallet handover');
  return parts.length ? parts : null;
}

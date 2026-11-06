// The project's roles (Project.sol: keccak256 of the role's name) and what the
// page calls them.
import { keccak256, toHex, type Hex } from 'viem';

export const ROLES = ['ADMIN_ROLE', 'MANAGER_ROLE', 'OPERATIONS_ROLE', 'COMPANY_ROLE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_ID = Object.fromEntries(ROLES.map((r) => [r, keccak256(toHex(r))])) as Record<Role, Hex>;
export const OWNER_ROLE_ID = keccak256(toHex('OWNER_ROLE'));

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN_ROLE: 'Admin',
  MANAGER_ROLE: 'Manager',
  OPERATIONS_ROLE: 'Operations',
  COMPANY_ROLE: 'Company',
};

/** Role id → "manager", for error messages. */
export const ROLE_NAME_BY_ID: Record<string, string> = {
  [OWNER_ROLE_ID]: 'owner',
  ...Object.fromEntries(ROLES.map((r) => [ROLE_ID[r], ROLE_LABEL[r].toLowerCase()])),
};

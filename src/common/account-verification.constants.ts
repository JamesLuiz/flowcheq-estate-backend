/** Non-admin roles that must complete YouVerify KYC and fund a virtual wallet first */
export const ACCOUNT_VERIFICATION_ROLES = new Set([
  'landlord',
  'agent',
  'company',
  'real_estate_company',
  'user',
  'tenant',
  'house_hunter',
  'lawyer',
]);

export function requiresAccountVerification(role?: string | null): boolean {
  return Boolean(role && ACCOUNT_VERIFICATION_ROLES.has(role));
}

export function canAccessWallet(role?: string | null): boolean {
  return requiresAccountVerification(role);
}

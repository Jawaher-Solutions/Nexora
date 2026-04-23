// utils/tokens.ts
// RULE: Pure token generation helpers. No database calls.

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a cryptographically random refresh token.
 */
export function generateRefreshToken(): string {
  return uuidv4();
}

/**
 * Calculate refresh token expiry date.
 */
export function getRefreshTokenExpiry(days: number = 30): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

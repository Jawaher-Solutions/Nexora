// utils/hash.ts
// RULE: Pure functions only. No I/O, no database, no network.

import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../config/constants';

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function comparePassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

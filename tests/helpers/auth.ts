import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

export function generateTestToken(userId: string, role: string = 'USER'): string {
  return jwt.sign({ userId, role }, env.JWT_SECRET, { expiresIn: '1h' });
}

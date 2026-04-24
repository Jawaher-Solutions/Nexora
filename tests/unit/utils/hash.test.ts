import { comparePassword, hashPassword } from '../../../src/utils/hash';

describe('hash utils', () => {
  it('hashPassword returns a bcrypt hash', async () => {
    const hashed = await hashPassword('password123');
    expect(hashed.startsWith('$2')).toBe(true);
  });

  it('hashPassword produces different hashes for same input', async () => {
    const a = await hashPassword('password123');
    const b = await hashPassword('password123');
    expect(a).not.toBe(b);
  });

  it('comparePassword returns true for correct password', async () => {
    const hashed = await hashPassword('password123');
    const ok = await comparePassword('password123', hashed);
    expect(ok).toBe(true);
  });

  it('comparePassword returns false for wrong password', async () => {
    const hashed = await hashPassword('correct');
    const ok = await comparePassword('wrong', hashed);
    expect(ok).toBe(false);
  });
});

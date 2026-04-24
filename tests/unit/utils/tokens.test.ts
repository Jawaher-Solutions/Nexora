import { generateRefreshToken, getRefreshTokenExpiry } from '../../../src/utils/tokens';

describe('token utils', () => {
  it('generateRefreshToken returns a non-empty string', () => {
    const t = generateRefreshToken();
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
  });

  it('generateRefreshToken produces unique tokens', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateRefreshToken());
    expect(set.size).toBe(100);
  });

  it('getRefreshTokenExpiry returns a future Date', () => {
    const d = getRefreshTokenExpiry();
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });

  it('getRefreshTokenExpiry is approximately 30 days from now', () => {
    const now = new Date();
    const expiry = getRefreshTokenExpiry(30);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });
});

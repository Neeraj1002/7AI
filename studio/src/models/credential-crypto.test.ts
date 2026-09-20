import { describe, it, expect } from 'vitest';
import { encryptRefreshToken, decryptRefreshToken } from './credential-crypto';

// Sprint 3 Task 5 (M1) — the real, configured CREDENTIAL_ENCRYPTION_KEY
// from .env.local (this project's tests already load real env vars —
// jwt.test.ts, request-identity.test.ts establish the same posture for
// JWT_SECRET/API_AUTH_TOKEN).

describe('credential-crypto round trip', () => {
  it('encrypts and decrypts a realistic refresh-token-shaped string back to the exact original', () => {
    const plaintext = '1//0gTestRefreshTokenShapedString-AbCdEf123456_ghijklMNOPqrstuvWXYZ';
    const encrypted = encryptRefreshToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
    const decrypted = decryptRefreshToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext on separate calls (real random IV, not deterministic)', () => {
    const plaintext = 'same-plaintext-both-times';
    const first = encryptRefreshToken(plaintext);
    const second = encryptRefreshToken(plaintext);
    expect(first).not.toBe(second);
    expect(decryptRefreshToken(first)).toBe(plaintext);
    expect(decryptRefreshToken(second)).toBe(plaintext);
  });

  it('rejects a tampered ciphertext rather than silently returning garbage plaintext', () => {
    const encrypted = encryptRefreshToken('a-real-looking-token');
    const raw = Buffer.from(encrypted, 'base64');
    // Flip one byte well inside the ciphertext portion (past the 12-byte IV
    // and 16-byte authTag) — GCM's own authentication must reject this.
    raw[raw.length - 1] ^= 0xff;
    const tampered = raw.toString('base64');
    expect(() => decryptRefreshToken(tampered)).toThrow();
  });
});

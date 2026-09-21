import { describe, it, expect } from 'vitest';
import {
  signMagicLinkToken,
  verifyMagicLinkToken,
  signSessionToken,
  verifySessionToken,
  isAuthConfigured,
} from './jwt';

// Sprint 3 Task 1 (J2) — jwt.ts is the only file touching `jsonwebtoken`
// directly, isolated exactly so its sign/verify round trip and the
// purpose-claim guard can be unit tested directly. requestMagicLink/
// verifyMagicLink themselves (the DB-backed half) are verified via real
// live testing instead — same posture this project's other DB-backed
// modules (post-hoc-tag.ts, founder-digest.ts) already established.

describe('isAuthConfigured', () => {
  it('is true when JWT_SECRET is set in the real test environment', () => {
    // This project's tests load the real .env.local (env.ts's own
    // dotenv.config() call) — a real, configured JWT_SECRET is expected to
    // be present, same posture youtube-client.test.ts already takes for
    // real YouTube credentials.
    expect(isAuthConfigured()).toBe(true);
  });
});

describe('magic-link token sign/verify round trip', () => {
  it('round-trips userId and jti', () => {
    const token = signMagicLinkToken({ userId: 'user-1', jti: 'jti-1' });
    const decoded = verifyMagicLinkToken(token);
    expect(decoded).toMatchObject({ purpose: 'magic-link', sub: 'user-1', jti: 'jti-1' });
  });

  it('rejects a tampered token', () => {
    const token = signMagicLinkToken({ userId: 'user-1', jti: 'jti-1' });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(verifyMagicLinkToken(tampered)).toBeNull();
  });

  it('rejects a garbage string', () => {
    expect(verifyMagicLinkToken('not-a-real-jwt')).toBeNull();
  });

  it('a real session token is never accepted as a magic-link token, even though both are signed with the same secret', () => {
    const sessionToken = signSessionToken({ userId: 'user-1', tenantId: 'tenant-1', role: 'owner' });
    expect(verifyMagicLinkToken(sessionToken)).toBeNull();
  });
});

describe('session token sign/verify round trip', () => {
  it('round-trips userId, tenantId, and role', () => {
    const token = signSessionToken({ userId: 'user-1', tenantId: 'tenant-1', role: 'approver' });
    const decoded = verifySessionToken(token);
    expect(decoded).toMatchObject({
      purpose: 'session',
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'approver',
    });
  });

  it('rejects a tampered token', () => {
    const token = signSessionToken({ userId: 'user-1', tenantId: 'tenant-1', role: 'owner' });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('a real magic-link token is never accepted as a session token, even though both are signed with the same secret', () => {
    const magicLinkToken = signMagicLinkToken({ userId: 'user-1', jti: 'jti-1' });
    expect(verifySessionToken(magicLinkToken)).toBeNull();
  });
});

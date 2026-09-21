import { describe, it, expect } from 'vitest';
import { resolveRequestIdentity } from './request-identity';
import { signSessionToken, signMagicLinkToken } from './jwt';
import { env } from '../config/env';

// Sprint 3 Task 1 (J2) — resolveRequestIdentity is the single source of
// truth api/server.ts's onRequest hook and api/trpc.ts's createContext both
// call into; unit tested directly here against real signed tokens (this
// project's real, configured JWT_SECRET/API_AUTH_TOKEN from .env.local).

describe('resolveRequestIdentity', () => {
  it('classifies a missing Authorization header as unauthenticated', () => {
    expect(resolveRequestIdentity(undefined)).toEqual({ kind: 'unauthenticated' });
  });

  it('classifies a header without a Bearer prefix as unauthenticated', () => {
    expect(resolveRequestIdentity('not-bearer-shaped')).toEqual({ kind: 'unauthenticated' });
  });

  it('classifies the real configured API_AUTH_TOKEN as ops-token', () => {
    expect(resolveRequestIdentity(`Bearer ${env.API_AUTH_TOKEN}`)).toEqual({ kind: 'ops-token' });
  });

  it('classifies a real, valid session token by its real payload', () => {
    const token = signSessionToken({ userId: 'user-1', tenantId: 'tenant-1', role: 'approver' });
    expect(resolveRequestIdentity(`Bearer ${token}`)).toEqual({
      kind: 'session',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'approver',
    });
  });

  it('classifies a magic-link token (wrong purpose) as unauthenticated, not a session', () => {
    const magicLinkToken = signMagicLinkToken({ userId: 'user-1', jti: 'jti-1' });
    expect(resolveRequestIdentity(`Bearer ${magicLinkToken}`)).toEqual({ kind: 'unauthenticated' });
  });

  it('classifies a garbage bearer token as unauthenticated', () => {
    expect(resolveRequestIdentity('Bearer complete-nonsense')).toEqual({ kind: 'unauthenticated' });
  });
});

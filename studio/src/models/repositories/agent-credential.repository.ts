import { prisma } from '../prisma-client';
import type { AgentCredential as PrismaAgentCredential } from '@prisma/client';
import { encryptRefreshToken, decryptRefreshToken } from '../credential-crypto';
import type { AgentCredential, ChannelPlatform } from '../../types';

function toDomainAgentCredential(row: PrismaAgentCredential): AgentCredential {
  return {
    id: row.id,
    channelId: row.channelId,
    platform: row.platform as ChannelPlatform,
    refreshTokenEncrypted: row.refreshTokenEncrypted,
    encryptionKeyVersion: row.encryptionKeyVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Never decrypts — the raw (still-encrypted) row, for existence checks and
// the M1 encrypt->store->read->decrypt verification's own "confirm this is
// genuinely ciphertext" step.
export async function findByChannel(channelId: string): Promise<AgentCredential | null> {
  const row = await prisma.agentCredential.findUnique({ where: { channelId } });
  return row ? toDomainAgentCredential(row) : null;
}

// Encrypts on write — callers (the OAuth callback, the founder-credential
// migration script) always pass a real plaintext refresh token, never
// touch credential-crypto.ts themselves. Upsert, not insert-only: a
// channel reconnecting (e.g. after a revoked/expired token) replaces its
// existing row rather than colliding on the unique(channelId) constraint.
export async function upsertForChannel(
  channelId: string,
  platform: ChannelPlatform,
  refreshToken: string,
): Promise<AgentCredential> {
  const refreshTokenEncrypted = encryptRefreshToken(refreshToken);
  const row = await prisma.agentCredential.upsert({
    where: { channelId },
    create: { channelId, platform, refreshTokenEncrypted },
    update: { refreshTokenEncrypted },
  });
  return toDomainAgentCredential(row);
}

// M2's disconnect path — the design doc's own "a clear disconnect path in
// the app" requirement, which did not exist in any form before this task.
// A no-op (not an error) if the channel never had a credential — disconnect
// is idempotent by nature.
export async function deleteForChannel(channelId: string): Promise<void> {
  await prisma.agentCredential.deleteMany({ where: { channelId } });
}

// Sprint 3 Task 5 (M3) — the one real addition beyond the task's own
// literal three-function list, justified by M3's actual need: the three
// YouTube client modules need the *decrypted* token to build an
// OAuth2Client, not the encrypted row. Co-locating the decrypt call here
// (rather than making each client import credential-crypto.ts directly)
// keeps "decrypt" paired with "the only place refreshTokenEncrypted is
// read," the same repository-owns-its-column posture upsertForChannel's
// own encrypt-on-write already establishes.
export async function findDecryptedRefreshTokenForChannel(channelId: string): Promise<string | null> {
  const credential = await findByChannel(channelId);
  if (!credential) return null;
  return decryptRefreshToken(credential.refreshTokenEncrypted);
}

// Bugs Task 12 (R7) - which of these channels have a connected YouTube credential (the same
// "connected" test as assertChannelCanRun), in one query.
export async function listChannelIdsWithCredential(channelIds: string[]): Promise<Set<string>> {
  if (channelIds.length === 0) return new Set();
  const rows = await prisma.agentCredential.findMany({
    where: { channelId: { in: channelIds } },
    select: { channelId: true },
  });
  return new Set(rows.map((r) => r.channelId).filter((id): id is string => id !== null));
}

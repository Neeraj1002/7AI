import type { ChannelPlatform } from './channel.types';

// Sprint 3 Task 5 (M1) — see schema.prisma's AgentCredential model comment.
// The domain type intentionally never exposes the decrypted refresh token
// as a persistent field — only findAgentCredentialDecrypted (the repository's
// own explicit, narrowly-named function) returns one, and only in-memory,
// never logged or serialized elsewhere.
export type AgentCredential = {
  id: string;
  channelId: string;
  platform: ChannelPlatform;
  refreshTokenEncrypted: string;
  encryptionKeyVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

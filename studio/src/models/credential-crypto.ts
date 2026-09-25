import crypto from 'node:crypto';
import { env } from '../config/env';

// Sprint 3 Task 5 (M1) — AES-256-GCM via Node's built-in `crypto`, no new
// dependency. Lives in models/ (not agents/publishing/) since
// agents/performance-analytics/ also needs it and agents don't import from
// each other (AGENT_FLEET_DESIGN.md Principle 5) — models/ is neutral
// ground both can reach without a cross-agent import.
//
// Stored format: base64(iv (12 bytes) || authTag (16 bytes) || ciphertext).
// GCM's authTag is what makes a tampered/corrupted ciphertext fail to
// decrypt loudly, rather than silently producing garbage plaintext.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // GCM's standard/recommended nonce size
const AUTH_TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  if (!env.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY is not set — cannot encrypt/decrypt a real OAuth credential. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}) — regenerate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

export function encryptRefreshToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptRefreshToken(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

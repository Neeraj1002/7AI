import fs from 'node:fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

// Sprint 3 Task 12 (R1) — the only file allowed to touch the R2 SDK, same
// boundary pattern agents/publishing/youtube-client.ts and stock-footage's
// own client files already establish. Cloudflare R2 is S3-API-compatible —
// this is Cloudflare's own documented integration path: @aws-sdk/client-s3
// pointed at the account's R2 endpoint (not an AWS one) via a custom
// `endpoint`, with `forcePathStyle` (R2's documented requirement) and a
// region value R2 itself ignores but the SDK still requires non-empty.
//
// Every function here is additive/best-effort from the caller's own
// perspective — R2 being unset, misconfigured, or down must never be a way
// to break the actual pipeline (video generation, publishing, watermark
// upload). isR2Configured() is the one gate every call site checks first;
// this module itself doesn't silently no-op inside upload/delete/presign —
// a caller that calls them without checking isR2Configured() first will get
// a real thrown error, by design, so a caller can never forget the check.

let cachedClient: S3Client | null = null;
let loggedUnconfiguredOnce = false;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_ENDPOINT,
  );
}

// R2_REGION is deliberately not required by isR2Configured() — R2 itself
// ignores the region value (confirmed against Cloudflare's own S3-API
// docs), the SDK just requires the field to be a non-empty string. Falls
// back to 'auto' (Cloudflare's own documented placeholder value) so a
// checkout with every other R2_* var set but R2_REGION left blank still
// works, rather than being a sixth required field for no functional reason.
function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: env.R2_REGION || 'auto',
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

// Logged once, not per call site — every R2/R3/R4 upload attempt would
// otherwise log the identical "not configured" line on every single run
// once one checkout is genuinely R2-unconfigured (e.g. every local dev
// checkout that hasn't set these up).
function warnUnconfiguredOnce(): void {
  if (loggedUnconfiguredOnce) return;
  loggedUnconfiguredOnce = true;
  console.warn('[r2-client] R2 is not configured (one or more R2_* env vars unset) — R2 uploads are skipped.');
}
// Exposed so call sites that want the exact same "log once" behavior for
// their own skip decision can share it, rather than each re-implementing
// its own log-once flag.
export { warnUnconfiguredOnce as logR2UnconfiguredOnce };

export async function uploadToR2(params: { key: string; filePath: string; contentType: string }): Promise<{ key: string }> {
  const body = await fs.readFile(params.filePath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
    }),
  );
  return { key: params.key };
}

// Best-effort at the call site (R4's watermark-delete path), not inside
// this function — a delete failure here is a real thrown error, same
// posture as uploadToR2/getPresignedDownloadUrl above.
export async function deleteFromR2(params: { key: string }): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: params.key }));
}

export async function getPresignedDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: params.key });
  return getSignedUrl(getClient(), command, { expiresIn: params.expiresInSeconds });
}

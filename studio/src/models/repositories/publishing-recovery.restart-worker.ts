import { prisma } from '../prisma-client';
import { claimPublishing, savePublishingSession } from './publishing-recovery.repository';
import { uploadResumableVideo } from '../../agents/publishing/resumable-upload';
import type { OAuth2Client } from 'google-auth-library';
import type { ReceiptIdentity } from '../../run-pipeline/publishing-recovery';
import type { UploadParams } from '../../agents/publishing/types';

async function main() {
  const [runId, identityText, videoPath, portText] = process.argv.slice(2);
  const identity = JSON.parse(identityText) as ReceiptIdentity;
  const owner = await claimPublishing(runId, identity);
  if (owner.kind !== 'acquired') throw new Error('restart worker could not claim');
  const base = 'http://127.0.0.1:' + portText;
  const request = async (options: { url: string; method: string; headers?: Record<string, string>; data?: unknown }) => {
    const source = new URL(options.url);
    const body = options.data && typeof options.data === 'object' && !('pipe' in options.data)
      ? JSON.stringify(options.data) : options.data as RequestInit['body'];
    const response = await fetch(base + source.pathname + source.search, {
      method: options.method, headers: options.headers, body: body as RequestInit['body'],
      redirect: 'manual', duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    return { status: response.status, headers: response.headers,
      data: response.status === 308 || response.status === 200 ? {} : await response.json() };
  };
  const params: UploadParams = { channelId: identity.channelId, videoPath, metadata: identity.metadata,
    privacyStatus: 'private', containsSyntheticMedia: false, selfDeclaredMadeForKids: false };
  await uploadResumableVideo({ request } as unknown as OAuth2Client, params, identity.fileSize, undefined, {
    persistSession: uri => savePublishingSession(runId, owner.token, uri),
    confirmedOffset: async () => {},
    beforeBytes: async () => new Promise<void>(() => {}),
  });
}
void main().catch(async () => { await prisma.$disconnect(); process.exitCode = 1; });

// Bugs Task 12 (R10.8) - one-off backfill (the founder runs it on the VPS): watermarks uploaded before
// Sprint 3 Task 12 R4 have no R2 mirror (no brandAssets.watermarkR2Key). Uploads each local watermark
// file to R2 and records the key. Safe to re-run: channels that already have a key are skipped.
//
// Usage:
//   npx tsx scripts/backfill-watermark-r2.ts            # dry run, prints what it would do
//   npx tsx scripts/backfill-watermark-r2.ts --apply
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/models/prisma-client';
import { env } from '../src/config/env';
import { isR2Configured, uploadToR2 } from '../src/storage/r2-client';
import { updateChannelBrandAssets } from '../src/models/repositories/channel.repository';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (apply && !isR2Configured()) throw new Error('R2 is not configured in this environment - nothing to mirror to');

  const channels = await prisma.channel.findMany({ select: { id: true, tenantId: true, name: true, brandAssets: true } });
  for (const c of channels) {
    const assets = (c.brandAssets ?? {}) as { watermarkUrl?: string; watermarkR2Key?: string };
    if (!assets.watermarkUrl || assets.watermarkR2Key) continue;
    const ext = path.extname(assets.watermarkUrl).slice(1).toLowerCase();
    const key = `watermarks/${env.NODE_ENV}/${c.tenantId}/${c.id}.${ext}`;
    const exists = await fs.stat(assets.watermarkUrl).then(() => true).catch(() => false);
    console.log(`${apply ? 'mirroring' : 'would mirror'} ${c.name} (${c.id}) ${exists ? '' : '- LOCAL FILE MISSING, skipped'} -> ${key}`);
    if (!apply || !exists) continue;
    await uploadToR2({ key, filePath: assets.watermarkUrl, contentType: MIME[ext] ?? 'application/octet-stream' });
    await updateChannelBrandAssets(c.id, { watermarkR2Key: key });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

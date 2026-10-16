import { claimPublishing } from './publishing-recovery.repository';
import { prisma } from '../prisma-client';
import type { ReceiptIdentity } from '../../run-pipeline/publishing-recovery';

async function main() {
  const runId = process.argv[2];
  const identity = JSON.parse(process.argv[3]) as ReceiptIdentity;
  const result = await claimPublishing(runId, identity);
  process.stdout.write('CLAIM=' + result.kind + '\n');
  await prisma.$disconnect();
}
void main().catch(async () => { await prisma.$disconnect(); process.exitCode = 1; });

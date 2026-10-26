// Spike S0/S1 helper: READ-ONLY look at the dev database (channels, active profile text, stage counts, scripts). No writes.
//   cd studio && npx tsx scripts/spikes/packaging/s0-inspect.ts
import { prisma } from '../../../src/models/prisma-client';
import type { ChannelProfileData } from '../../../src/channel-profile/schema';

async function main() {
  console.log('db:', (process.env.DATABASE_URL ?? '').replace(/\/\/.*@/, '//***@'));
  const channels = await prisma.channel.findMany({ select: { id: true, name: true, activeProfileVersionId: true } });
  let withProfile = 0;
  for (const c of channels) {
    const prof = c.activeProfileVersionId ? await prisma.channelProfileVersion.findUnique({ where: { id: c.activeProfileVersionId } }) : null;
    if (!prof) continue;
    withProfile += 1;
    const d = prof.data as ChannelProfileData;
    console.log(c.name, '| style:', d.visual?.stylePrompt?.slice(0, 120), '| negative:', d.visual?.negativePrompt?.slice(0, 80));
  }
  console.log(`channels: ${channels.length}, with an active profile: ${withProfile}, profile versions: ${await prisma.channelProfileVersion.count()}`);
  const scripts = await prisma.pipelineStage.count({ where: { stageName: 'script_generation', status: 'completed' } });
  const gate1 = await prisma.pipelineStage.count({ where: { stageName: 'gate1', status: 'completed' } });
  console.log(`completed script_generation stages: ${scripts}, completed gate1 stages: ${gate1}`);
  for (const word of ['Mary Celeste', 'Lego']) {
    const n = await prisma.pipelineRun.count({ where: { briefText: { contains: word, mode: 'insensitive' } } });
    console.log(`runs whose brief mentions "${word}": ${n}`);
  }
}
main().finally(() => prisma.$disconnect());

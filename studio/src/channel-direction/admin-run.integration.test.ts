import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../models/prisma-client';
import { findActiveProfileForChannel, insertProfileVersion, listProfileVersionsForChannel } from '../models/repositories/channel-profile-version.repository';
import { SANDBOX } from '../test-support/sandbox';
import { parseAssignments } from './admin-plan';
import { setChannelDirections, type DirectionAdminRepository } from './admin-run';

describe.skipIf(!SANDBOX)('set-channel-directions against a named sandbox database', () => {
  let tenantId: string;
  let channels: { id: string; name: string }[];
  let assignments: ReturnType<typeof parseAssignments>;
  let log: string[];

  const repository: DirectionAdminRepository = {
    findChannels: (id, name) => prisma.channel.findMany({ where: { tenantId: id, name, isActive: true } }),
    findActiveProfile: findActiveProfileForChannel,
    insertProfileVersion,
  };
  const run = (live: boolean, chosen = assignments, repo = repository) =>
    setChannelDirections({ tenantId, assignments: chosen, live, repository: repo, log: (line) => log.push(line) });
  const versions = () => Promise.all(channels.map((channel) => listProfileVersionsForChannel(channel.id)));

  beforeEach(async () => {
    tenantId = randomUUID();
    channels = [0, 1, 2].map((index) => ({ id: randomUUID(), name: `Direction fixture ${tenantId} ${index}` }));
    assignments = parseAssignments([
      `${channels[0]!.name}=history`,
      `${channels[1]!.name}=story-first`,
      `${channels[2]!.name}=explainer`,
    ]);
    log = [];
    await prisma.tenant.create({ data: { id: tenantId, name: `Direction fixture ${tenantId}` } });
    await prisma.channel.createMany({ data: channels.map((channel) => ({ ...channel, tenantId, nicheDescription: 'Synthetic fixture' })) });
    for (const [index, channel] of channels.entries()) {
      await insertProfileVersion({
        channelId: channel.id,
        data: {
          script: { guide: `Guide ${index}` },
          visual: { stylePrompt: `Visual ${index}` },
          packaging: { titleGuidance: `Title ${index}` },
          ...(index === 0 ? { direction: { preset: 'neutral', note: 'Keep the opening grounded.' } } : {}),
        },
        createdByUserId: null,
      });
    }
  });

  afterEach(async () => {
    await prisma.channel.updateMany({ where: { tenantId }, data: { activeProfileVersionId: null } });
    await prisma.channelProfileVersion.deleteMany({ where: { channelId: { in: channels.map((channel) => channel.id) } } });
    await prisma.channel.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('dry run prints every planned version change and writes nothing', async () => {
    await run(false);
    expect(log.filter((line) => line.includes('DRY RUN'))).toHaveLength(3);
    expect(log[0]).toContain('version 1 -> 2, preset history');
    expect((await versions()).map((rows) => rows.length)).toEqual([1, 1, 1]);
  });

  it('unknown channel refuses before any channel is written', async () => {
    const chosen = parseAssignments([
      `${channels[0]!.name}=history`, `${channels[1]!.name}=story-first`, 'Missing channel=explainer',
    ]);
    await expect(run(true, chosen)).rejects.toThrow(/Nothing was written/);
    expect((await versions()).map((rows) => rows.length)).toEqual([1, 1, 1]);
  });

  it('duplicate channel refuses in the script parser before any write', async () => {
    expect(() => parseAssignments([
      `${channels[0]!.name}=history`, `${channels[0]!.name}=story-first`, `${channels[2]!.name}=explainer`,
    ])).toThrow(/unique/);
    expect((await versions()).map((rows) => rows.length)).toEqual([1, 1, 1]);
  });

  it('missing profile refuses before the other two channels are written', async () => {
    await prisma.channel.update({ where: { id: channels[2]!.id }, data: { activeProfileVersionId: null } });
    await prisma.channelProfileVersion.deleteMany({ where: { channelId: channels[2]!.id } });
    await expect(run(true)).rejects.toThrow(/has no content profile/);
    expect((await versions()).map((rows) => rows.length)).toEqual([1, 1, 0]);
  });

  it('live writes only direction for all three, keeps the note, and rerunning creates no version', async () => {
    const before = (await versions()).map((rows) => rows[0]!.data);
    await run(true);
    const after = await versions();
    expect(after.map((rows) => rows.map((row) => row.version))).toEqual([[2, 1], [2, 1], [2, 1]]);
    for (const [index, rows] of after.entries()) {
      const old = before[index]!;
      const saved = rows[0]!.data;
      expect(saved.script).toEqual(old.script);
      expect(saved.visual).toEqual(old.visual);
      expect(saved.packaging).toEqual(old.packaging);
      expect(saved.offeredFormatKeys).toEqual(old.offeredFormatKeys);
      expect(saved.audio).toEqual(old.audio);
      expect(saved.storyTests).toEqual(old.storyTests);
      expect(saved.direction?.preset).toBe(assignments[index]!.preset);
    }
    expect(after[0]![0]!.data.direction?.note).toBe('Keep the opening grounded.');
    log = [];
    await run(true);
    expect(log.filter((line) => line.includes('no version created'))).toHaveLength(3);
    expect((await versions()).map((rows) => rows.length)).toEqual([2, 2, 2]);
  });

  it('a profile changed between precheck and write stops without an admin version', async () => {
    let reads = 0;
    const racing: DirectionAdminRepository = {
      ...repository,
      findActiveProfile: async (channelId) => {
        if (channelId === channels[0]!.id && ++reads === 2) {
          await insertProfileVersion({
            channelId,
            data: { script: { guide: 'Concurrent edit' } },
            createdByUserId: null,
          });
        }
        return findActiveProfileForChannel(channelId);
      },
    };
    await expect(run(true, assignments, racing)).rejects.toThrow(/Profile changed during this operation/);
    const rows = await versions();
    expect(rows.map((entry) => entry.length)).toEqual([2, 1, 1]);
    expect(rows[0]![0]!.data.script?.guide).toBe('Concurrent edit');
    expect(rows[0]![0]!.data.direction).toBeUndefined();
    expect(log.some((line) => line.includes('SAVED'))).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findRunIdentity: vi.fn(),
  readStageAttempts: vi.fn(),
  writeAdminAudit: vi.fn(),
}));

vi.mock('../../../models/prisma-client', () => ({
  prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) },
}));
vi.mock('../../../models/repositories/admin-audit.repository', async (orig) => ({
  ...(await orig<object>()),
  writeAdminAudit: mocks.writeAdminAudit,
}));
vi.mock('../../../models/repositories/admin-runs.repository', async (orig) => ({
  ...(await orig<object>()),
  findRunIdentity: mocks.findRunIdentity,
  readStageAttempts: mocks.readStageAttempts,
}));

import { appRouter } from '../../router';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'SECRETSCRIPT-raw-model-reply';
const ops = () => appRouter.createCaller({ tenantId: 't1', userId: null, role: 'owner', identityKind: 'ops-token' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findRunIdentity.mockResolvedValue({ id: RUN_ID, tenantId: 't1' });
  mocks.writeAdminAudit.mockResolvedValue(undefined);
});

describe('admin.runs.content for a failed stage (Bugs Task 11, PR #55)', () => {
  it('returns only the diagnostic keys, never the raw reply', async () => {
    mocks.readStageAttempts.mockResolvedValue([
      {
        stageName: 'script_generation',
        attemptNumber: 1,
        status: 'failed',
        output: {
          rawReply: `{"scriptText":"${SECRET}`,
          firstRawReply: `first ${SECRET}`,
          stopReason: 'stop',
          replyLength: 321,
          parseError: 'Expected , at position 213',
          attempts: 2,
          rawReplyTruncated: false,
        },
      },
    ]);
    const result = await ops().admin.runs.content({ runId: RUN_ID, kind: 'stage_output', stageName: 'script_generation' });
    const text = JSON.stringify(result);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('rawReply"');
    expect(text).not.toContain('firstRawReply');
    expect(result).toMatchObject({ content: { stopReason: 'stop', replyLength: 321, attempts: 2 } });
  });

  it('still returns a completed stage output unchanged (the script the tenant approved)', async () => {
    mocks.readStageAttempts.mockResolvedValue([
      { stageName: 'script_generation', attemptNumber: 1, status: 'completed', output: { scriptText: SECRET } },
    ]);
    const result = await ops().admin.runs.content({ runId: RUN_ID, kind: 'stage_output', stageName: 'script_generation' });
    expect(JSON.stringify(result)).toContain(SECRET);
  });
});

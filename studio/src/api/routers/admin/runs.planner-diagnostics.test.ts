import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ identity: vi.fn(), audit: vi.fn(), diagnostics: vi.fn(), user: vi.fn() }));
vi.mock('../../../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../../../models/repositories/admin-audit.repository', async orig => ({ ...await orig<object>(), writeAdminAudit: mocks.audit }));
vi.mock('../../../models/repositories/admin-runs.repository', async orig => ({ ...await orig<object>(), findRunIdentity: mocks.identity }));
vi.mock('../../../models/repositories/admin-planner-diagnostics.repository', () => ({ readPlannerDiagnostics: mocks.diagnostics }));
vi.mock('../../../models/repositories/user.repository', () => ({ findUserById: mocks.user }));
import { adminRunsRouter } from './runs';
const runId = '11111111-1111-4111-8111-111111111111';
const ops = () => adminRunsRouter.createCaller({ tenantId: 't', userId: null, role: 'owner', identityKind: 'ops-token' });
const owner = () => adminRunsRouter.createCaller({ tenantId: 't', userId: 'u', role: 'owner', identityKind: 'session' });
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockResolvedValue({ id: runId, tenantId: 't' }); mocks.diagnostics.mockResolvedValue({ version: 1, runId, attemptNumber: 5, calls: [{ inputTokens: 123, outputTokens: 456 }], truncated: true }); mocks.user.mockResolvedValue({ id: 'u', isPlatformAdmin: false }); });
describe('audited planner diagnostics content route', () => {
  it('audits before reading selected-attempt diagnostics and preserves safe token counters', async () => {
    const order: string[] = [];
    mocks.audit.mockImplementation(async () => { order.push('audit'); });
    mocks.diagnostics.mockImplementation(async () => { order.push('read'); return { version: 1, runId, attemptNumber: 5, calls: [{ inputTokens: 123 }], truncated: true }; });
    const result = await ops().content({ runId, kind: 'planner_diagnostics', attemptNumber: 5 });
    expect(order).toEqual(['audit', 'read']); expect(result).toMatchObject({ kind: 'planner_diagnostics', content: { calls: [{ inputTokens: 123 }] }, truncated: true });
    expect(mocks.audit).toHaveBeenCalledTimes(1); expect(mocks.audit.mock.calls[0][1]).toMatchObject({ action: 'run.content_view', targetId: runId, after: { kind: 'planner_diagnostics', attemptNumber: 5 } });
    expect(mocks.diagnostics).toHaveBeenCalledWith(runId, 5);
  });
  it('uses latest attempt when unnamed', async () => { await ops().content({ runId, kind: 'planner_diagnostics' }); expect(mocks.diagnostics).toHaveBeenCalledWith(runId, undefined); });
  it('returns no content and performs no diagnostic read when audit fails', async () => {
    mocks.audit.mockRejectedValue(new Error('SECRET failure'));
    await expect(ops().content({ runId, kind: 'planner_diagnostics' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not record the audit entry; no content returned' });
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });
  it('rejects non-admin before run lookup or audit', async () => {
    await expect(owner().content({ runId, kind: 'planner_diagnostics' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.identity).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.diagnostics).not.toHaveBeenCalled();
  });
  it('allows a freshly flagged platform-admin session', async () => { mocks.user.mockResolvedValue({ id: 'u', isPlatformAdmin: true }); await owner().content({ runId, kind: 'planner_diagnostics' }); expect(mocks.audit.mock.calls[0][1].actor).toEqual({ kind: 'session', userId: 'u' }); });
  it('audits attempted content reads even when no video attempt exists', async () => { mocks.diagnostics.mockResolvedValue(null); await expect(ops().content({ runId, kind: 'planner_diagnostics' })).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(mocks.audit).toHaveBeenCalledTimes(1); });
  it('requires an existing UUID run before auditing', async () => {
    await expect(ops().content({ runId: '../other', kind: 'planner_diagnostics' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    mocks.identity.mockResolvedValue(null); await expect(ops().content({ runId, kind: 'planner_diagnostics' })).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(mocks.audit).not.toHaveBeenCalled();
  });
});

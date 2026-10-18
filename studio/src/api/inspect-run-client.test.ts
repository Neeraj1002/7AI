import { describe, it, expect, vi, afterEach } from 'vitest';
import superjson from 'superjson';
import { inspectRun, sanitizePlannerResponse, sanitizeStructure, sanitizeContentView, parseInspectArguments, loadInspectCredential, INSPECT_RESPONSE_MAX_BYTES, INSPECT_EXPORT_MAX_BYTES, INSPECT_TIMEOUT_MS, type InspectTransport } from './inspect-run-client';
import { projectPlannerDiagnostics, type PlannerSource } from './planner-diagnostics';
const runId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222', token = 'tok_existing_admin_123456';
const at = '2026-10-14T16:58:06.247Z';
const diagnostic = projectPlannerDiagnostics({ runId, stageId: otherId, attemptNumber: 5, profileVersionId: null, creationOptions: null, status: 'failed', startedAt: at, completedAt: at, updatedAt: at, error: null, output: null, calls: [], deployed: { commit: '5b04a7a', bootedAt: at }, recovery: { legacyEligible: false, legacyCandidate: false, legacyUsed: null, recoverableFailure: null, provenance: 'fixed' } } as PlannerSource);
const structure = { run: { id: runId, tenantName: 'PRIVATE TENANT', channelName: 'PRIVATE CHANNEL', email: 'owner@private.test', status: 'needs_attention', currentStage: 'video_generation', briefText: 'PRIVATE BRIEF', lastError: 'PRIVATE SECRET', createdAt: at, updatedAt: at }, stages: [], usage: [], gates: [], totals: { events: 0 }, bundle: { attempts: [] } };
function wire(data: unknown) { return new Response(JSON.stringify({ result: { data: superjson.serialize(data) } }), { headers: { 'content-type': 'application/json' } }); }
function transportWith(extra?: unknown) {
  return vi.fn<InspectTransport>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('admin.system.info')) return wire({ commit: '5b04a7a', bootedAt: at, headers: { authorization: token }, flags: { mediaStub: false } });
    if (path.endsWith('admin.runs.get')) return wire(structure);
    const input = superjson.deserialize<{ kind: string }>(JSON.parse(String(init?.body)));
    return wire(input.kind === 'planner_diagnostics' ? { kind: 'planner_diagnostics', content: diagnostic, truncated: false } : extra ?? { kind: 'bundle_manifest', available: false });
  });
}
afterEach(() => vi.useRealTimers());
describe('fixed-route run inspector transport and sanitizer', () => {
  it('preserves an additive safe publishing summary with no extra request and supports older servers', async () => {
    const safe = { phase: 'uploaded', knownIdPresent: true, ambiguous: false, fingerprintMatches: null,
      ownershipActive: false, followups: { finalArtifact: 'succeeded', thumbnail: 'uncertain', captions: 'pending' } };
    const transport = transportWith();
    transport.mockImplementationOnce(async () => wire({ commit: '6464f9c', bootedAt: at }))
      .mockImplementationOnce(async () => wire({ ...structure, publishingSummary: {
        ...safe, sessionUri: 'PRIVATE_SESSION', ownerToken: 'PRIVATE_TOKEN', encryptedCredentials: 'PRIVATE_CIPHER',
        followups: { ...safe.followups, sessionCiphertext: 'PRIVATE_CIPHER' },
      } }));
    const result = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport);
    expect(result.results.structure).toMatchObject({ publishingSummary: safe });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(sanitizeStructure(structure, runId).publishingSummary).toBeNull();
  });
  it('defaults to two permitted GETs and one audited POST, using SuperJSON and the same run UUID', async () => {
    const transport = transportWith(); const result = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId, attemptNumber: 5 }, token, transport);
    expect(result.status.map(s => s.available)).toEqual([true, true, true]); expect(transport).toHaveBeenCalledTimes(3);
    const calls = transport.mock.calls;
    expect(calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])).toEqual([['/trpc/admin.system.info', 'GET'], ['/trpc/admin.runs.get', 'GET'], ['/trpc/admin.runs.content', 'POST']]);
    expect(superjson.deserialize(JSON.parse(new URL(String(calls[1][0])).searchParams.get('input')!))).toEqual({ runId });
    expect(superjson.deserialize(JSON.parse(String(calls[2][1]?.body)))).toEqual({ runId, kind: 'planner_diagnostics', attemptNumber: 5 });
    for (const [, init] of calls) { expect(init?.redirect).toBe('error'); expect(init?.signal).toBeTruthy(); }
    const text = JSON.stringify(result); for (const secret of [token, 'PRIVATE TENANT', 'PRIVATE CHANNEL', 'owner@private.test', 'PRIVATE BRIEF', 'authorization']) expect(text).not.toContain(secret);
  });
  it.each(['http://7aistudio.tech', 'https://evil.test', 'https://7aistudio.tech.evil.test', 'https://7aistudio.tech:443', 'https://u:p@7aistudio.tech', 'https://7aistudio.tech/../', 'https://7aistudio.tech/?token=x', 'https://7aistudio.tech/#x'])('rejects non-approved base %s before auth leaves', async baseUrl => {
    const transport = transportWith(); await expect(inspectRun({ baseUrl, runId }, token, transport)).rejects.toMatchObject({ code: 'BASE_URL_NOT_APPROVED' }); expect(transport).not.toHaveBeenCalled();
  });
  it.each([['--token', token], ['--procedure', 'runs.retry'], ['--run', '../run'], ['--run', runId, '--attempt', '1.5'], ['--run', runId, '--content', 'brief'], ['--run', runId, '--export', '../private.json'], ['--run', runId, '--run', otherId], ['--retry']].map(args => ({ args })))('rejects unsafe CLI input $args', ({ args }) => { expect(() => parseInspectArguments(args)).toThrow(); });
  it('requires explicit content choice; approved script and manifest are fixed views', async () => {
    const transport = transportWith({ kind: 'stage_output', stageName: 'gate1', attemptNumber: 1, content: { outcome: 'approve', sanctionedScriptText: 'approved narration', chapters: [] }, truncated: false });
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId, contentView: 'approved_script' }, token, transport);
    expect(transport).toHaveBeenCalledTimes(4); expect(superjson.deserialize(JSON.parse(String(transport.mock.calls[3][1]?.body)))).toEqual({ runId, kind: 'stage_output', stageName: 'gate1' });
    expect(r.results.approved_script).toMatchObject({ script: 'approved narration', available: true });
  });
  it.each([401, 403])('stops further requests on HTTP %s without echoing server error bodies', async status => {
    const transport = vi.fn<InspectTransport>(async () => new Response('SECRET ERROR HEADERS', { status }));
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport);
    expect(transport).toHaveBeenCalledTimes(1); expect(r.status[0]).toMatchObject({ available: false, httpStatus: status, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' }); expect(JSON.stringify(r)).not.toContain('SECRET');
  });
  it('rejects redirects and never follows Location', async () => {
    const transport = vi.fn<InspectTransport>(async () => new Response('', { status: 302, headers: { location: 'https://evil.test/?token=SECRET' } }));
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport);
    expect(r.status.every(s => s.code === 'REDIRECT_REJECTED')).toBe(true); expect(transport.mock.calls.every(([url]) => new URL(String(url)).hostname === '7aistudio.tech')).toBe(true); expect(JSON.stringify(r)).not.toContain('evil');
  });
  it('enforces stream byte cap even without Content-Length', async () => {
    const transport = vi.fn<InspectTransport>(async () => new Response('x'.repeat(INSPECT_RESPONSE_MAX_BYTES + 1)));
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport); expect(r.status.every(s => s.code === 'RESPONSE_TOO_LARGE')).toBe(true);
  });
  it('rejects oversized Content-Length without parsing a body', async () => {
    const transport = vi.fn<InspectTransport>(async () => new Response('SECRET', { headers: { 'content-length': String(INSPECT_RESPONSE_MAX_BYTES + 1) } }));
    expect((await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport)).status.every(s => s.code === 'RESPONSE_TOO_LARGE')).toBe(true);
  });
  it('times out each permitted request and sanitizes the transport exception', async () => {
    vi.useFakeTimers();
    const transport = vi.fn<InspectTransport>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('SECRET timeout')), { once: true })));
    const pending = inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport);
    await vi.advanceTimersByTimeAsync(INSPECT_TIMEOUT_MS * 3 + 1);
    const r = await pending; expect(r.status.map(s => s.code)).toEqual(['REQUEST_TIMEOUT', 'REQUEST_TIMEOUT', 'REQUEST_TIMEOUT']); expect(JSON.stringify(r)).not.toContain('SECRET');
  });
  it('rejects unrelated run or named-attempt results', () => {
    expect(() => sanitizeStructure({ ...structure, run: { id: otherId } }, runId)).toThrow();
    expect(() => sanitizePlannerResponse({ kind: 'planner_diagnostics', content: { ...diagnostic, runId: otherId } }, runId)).toThrow();
    expect(() => sanitizePlannerResponse({ kind: 'planner_diagnostics', content: diagnostic }, runId, 4)).toThrow();
  });
  it('drops recursively nested forbidden keys and arbitrary values from diagnostic export', () => {
    const bad = { ...diagnostic, rawReply: 'SECRET', session: { encryptedPayload: 'SECRET', ownerToken: 'SECRET' }, calls: [{ stageId: otherId, provider: 'anthropic', model: 'claude-sonnet-5', inputTokens: 123, outputTokens: null, metadata: { contractVersion: 3, validationError: 'SECRET', sessionUri: 'SECRET', rawReply: 'SECRET', nested: { password: 'SECRET' } } }], failure: { ...diagnostic.failure, parseError: 'SECRET', providerResponseBody: 'SECRET' }, checkpoint: { ...diagnostic.checkpoint, scenes: { prompt: 'SECRET' }, sceneIds: ['0:0', 'SECRET'] }, missing: [{ field: 'SECRET', reason: 'SECRET' }] };
    const safe = sanitizePlannerResponse({ kind: 'planner_diagnostics', content: bad, headers: { authorization: 'SECRET' } }, runId);
    const text = JSON.stringify(safe); expect(text).not.toContain('SECRET'); for (const key of ['rawReply', 'sessionUri', 'encryptedPayload', 'ownerToken', 'providerResponseBody', 'headers', 'password', 'prompt']) expect(text).not.toContain(`"${key}":`);
    expect(safe.calls[0].inputTokens).toBe(123); expect(safe.calls[0].outputTokens).toBeNull();
  });
  it('manifest flags/files derive only from listed known names, never user paths or signed keys', () => {
    const safe = sanitizeContentView({ kind: 'bundle_manifest', available: true, content: { files: [{ name: 'plan.json', bytes: 12, key: 'https://signed.test/plan?secret=SECRET' }, { name: '../SESSION_SECRET', key: 'SECRET' }] } }, 'bundle_manifest', token);
    expect(safe).toMatchObject({ files: [{ name: 'plan.json', bytes: 12 }] }); expect(JSON.stringify(safe)).not.toContain('SECRET'); expect(JSON.stringify(safe)).not.toContain('signed.test');
  });
  it('sanitizes only explicit approved content and omits unapproved/failed gate content', () => {
    const value = { kind: 'stage_output', stageName: 'gate1', content: { outcome: 'approve', sanctionedScriptText: `text ${token} owner@private.test https://signed.test/?secret=SECRET apiKey=SECRET`, rawReply: 'SECRET', chapters: [] } };
    const safe = sanitizeContentView(value, 'approved_script', token); expect(JSON.stringify(safe)).not.toContain('SECRET'); expect(JSON.stringify(safe)).not.toContain(token); expect(JSON.stringify(safe)).not.toContain('@private.test');
    expect(sanitizeContentView({ ...value, content: { ...value.content, outcome: 'reject' } }, 'approved_script', token)).toMatchObject({ available: false });
  });
  it('omits large explicit content from export with a named limit reason, preserving structured JSON', async () => {
    const transport = transportWith({ kind: 'stage_output', stageName: 'gate1', content: { outcome: 'approve', sanctionedScriptText: 'a'.repeat(40000), chapters: Array.from({ length: 5 }, () => ({ title: 'x', text: 'b'.repeat(40000) })) } });
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId, contentView: 'approved_script' }, token, transport);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(INSPECT_EXPORT_MAX_BYTES); expect(r.truncated).toBe(true); expect(r.results.approved_script).toBeUndefined(); expect(r.status).toContainEqual({ operation: 'export', available: false, code: 'EXPORT_CONTENT_OMITTED_AT_BYTE_LIMIT' });
  });
  it('does not assume new diagnostics are deployed when old API rejects that content kind', async () => {
    const transport = transportWith(); transport.mockImplementationOnce(async () => wire({ commit: '5b04a7a', bootedAt: at })).mockImplementationOnce(async () => wire(structure)).mockImplementationOnce(async () => new Response('SECRET', { status: 400 }));
    const r = await inspectRun({ baseUrl: 'https://7aistudio.tech', runId }, token, transport); expect(r.results.structure).toBeTruthy(); expect(r.status[2]).toMatchObject({ available: false, httpStatus: 400 });
  });
  it('loads existing env credential only; missing credentials require UI fallback', async () => { expect(await loadInspectCredential({ INSPECT_RUN_TOKEN: token })).toBe(token); expect(await loadInspectCredential({ API_AUTH_TOKEN: token })).toBe(token); await expect(loadInspectCredential({})).rejects.toMatchObject({ code: 'EXISTING_ADMIN_CREDENTIAL_UNAVAILABLE' }); });
});

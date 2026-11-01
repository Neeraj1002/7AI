import superjson from 'superjson';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import { sanitizePublishingSummary } from './publishing-summary';
import { asRecord, diagnosticHash, diagnosticId, diagnosticLabel, finiteNumber, CALL_METADATA_KEYS, plannerCallMetadata, safeValidationError, STOP_REASONS, FAILURE_KINDS, PLANNER_CALL_LIMIT, PLANNER_SCENE_LIMIT } from './planner-diagnostics';

export const INSPECT_RESPONSE_MAX_BYTES = 256 * 1024;
export const INSPECT_EXPORT_MAX_BYTES = 200 * 1024;
export const INSPECT_TIMEOUT_MS = 12_000;
export type ContentView = 'approved_script' | 'bundle_manifest' | 'production_plan';
export type InspectOptions = { baseUrl: string; runId: string; attemptNumber?: number; contentView?: ContentView };
export type InspectTransport = typeof fetch;
const uint = (v: unknown) => { const n = finiteNumber(v); return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null; };
const bool = (v: unknown) => typeof v === 'boolean' ? v : null;
const iso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const enumValue = (v: unknown, choices: readonly string[]) => typeof v === 'string' && choices.includes(v) ? v : null;
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const commit = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{4,40}$/i.test(v) ? v : null;

export class InspectError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number | null = null) { super(code); }
}
export function validateInspectOptions(options: InspectOptions): InspectOptions {
  // This host has existing owner authorization. Additional hosts require a reviewed
  // allowlist change, never a token-bearing redirect or CLI override.
  if (!/^https:\/\/7aistudio\.tech\/?$/.test(options.baseUrl)) throw new InspectError('BASE_URL_NOT_APPROVED');
  if (!z.string().uuid().safeParse(options.runId).success) throw new InspectError('RUN_UUID_REQUIRED');
  if (options.attemptNumber !== undefined && (!Number.isSafeInteger(options.attemptNumber) || options.attemptNumber <= 0)) throw new InspectError('INVALID_ATTEMPT');
  if (options.contentView !== undefined && !['approved_script', 'bundle_manifest', 'production_plan'].includes(options.contentView)) throw new InspectError('CONTENT_VIEW_NOT_APPROVED');
  return { ...options, baseUrl: 'https://7aistudio.tech' };
}

// Only an existing secret environment value or explicitly named local token file.
// No dotenv import into process.env, credential creation, CLI token argument or logging.
export async function loadInspectCredential(environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  let token = environment.INSPECT_RUN_TOKEN ?? environment.API_AUTH_TOKEN;
  if (!token && environment.INSPECT_RUN_TOKEN_FILE) {
    const handle = await open(environment.INSPECT_RUN_TOKEN_FILE, 'r');
    try {
      const buffer = Buffer.alloc(8193);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 8192) throw new InspectError('CREDENTIAL_FILE_TOO_LARGE');
      token = buffer.subarray(0, bytesRead).toString('utf8').trim();
    } finally { await handle.close(); }
  }
  if (!token || token.length < 16 || token.length > 8192 || !/^[a-zA-Z0-9._~+/-]+=*$/.test(token)) throw new InspectError('EXISTING_ADMIN_CREDENTIAL_UNAVAILABLE');
  return token;
}

const FAILURE_KEYS = ['classification', 'stopReason', 'firstStopReason', 'parseError', 'firstParseError', 'replyLength', 'firstReplyLength', 'rawReplyTruncated', 'firstRawReplyTruncated', 'attempts', 'plannerContractVersion', 'chapterIndex', 'sceneOffset', 'sceneCount', 'requestHash', 'requestKind', 'maxTokens', 'reusedSceneCount', 'recoveryStrategy', 'finalReceivedSceneCount', 'finalRequestedSceneCount', 'firstReceivedSceneCount', 'firstRequestedSceneCount'] as const;
const MISSING_FIELDS = new Set([
  'checkpoint', 'checkpoint.inputHash', 'checkpoint.contractVersion', 'checkpoint.sceneIds', 'checkpoint.completePlanPresent', 'checkpoint.completePlanInputHash',
  'calls', 'calls.metadata', 'calls.tokens', 'recovery.legacyUsed', 'recovery.legacyEligible', 'retained.stillsDone', 'retained.stillsTotal', 'retained.artifactFiles', 'deployed.commit', 'attempt.deployedCommit',
  ...['videoKind', 'targetSeconds', 'profileVersionId', 'manualVideoRetries', 'maxCostUsd'].map(k => 'run.' + k),
  ...FAILURE_KEYS.map(k => 'failure.' + k), ...CALL_METADATA_KEYS.map(k => 'calls.metadata.' + k),
]);
const MISSING_REASONS = [
  'not persisted on this attempt; absence is not evidence of no earlier work', 'missing or invalid persisted hash',
  'not persisted in legacy checkpoint; no version inferred', 'truncated at 200 scene IDs; acceptedSceneCount unknown beyond this bound',
  'unrecognized persisted scene IDs omitted; accepted count unknown', 'missing or malformed checkpoint scene map; accepted count unknown', 'not persisted on this attempt; storage presence does not prove restoration',
  'not persisted or not applicable; never reconstructed from a raw reply', 'not recorded; current defaults are not historical evidence',
  'one-use marker not recorded; null is not false', 'unavailable: current eligibility prerequisites could not be safely established',
  'no planner usage rows linked to this attempt; absence does not prove no reused plan',
  'legacy call metadata not persisted; provider request/reply tails unavailable', 'token counts not persisted on one or more usage rows', 'not persisted or invalid on one or more planner usage rows',
  'database query bounded to 100 rows plus one truncation sentinel; remaining calls omitted',
  'not persisted; progress is a hint, not verified asset integrity',
  'not read: use explicit audited bundle_manifest; only manifest-listed files establish bundle presence',
  'runtime revision unavailable', 'historical attempt revision not persisted; deployed describes the current diagnostic process only', '200 KiB response cap',
] as const;

export function sanitizePlannerResponse(value: unknown, runId: string, attemptNumber?: number) {
  const envelope = asRecord(value), s = asRecord(envelope.content);
  if (envelope.kind !== 'planner_diagnostics' || s.version !== 1 || s.runId !== runId || uint(s.attemptNumber) === null || (attemptNumber !== undefined && s.attemptNumber !== attemptNumber)) throw new InspectError('DIAGNOSTIC_SCOPE_MISMATCH');
  const failureSource = asRecord(s.failure), failure: Record<string, unknown> = {};
  for (const key of FAILURE_KEYS) {
    const v = failureSource[key];
    failure[key] = key === 'classification' ? enumValue(v, FAILURE_KINDS)
      : key === 'parseError' || key === 'firstParseError' ? safeValidationError(v)
      : key === 'stopReason' || key === 'firstStopReason' ? enumValue(v, STOP_REASONS)
      : key === 'requestHash' ? diagnosticHash(v)
      : key === 'requestKind' ? enumValue(v, ['initial', 'correction'])
      : key === 'recoveryStrategy' ? enumValue(v, ['accept', 'correct', 'split', 'escalate'])
      : key === 'rawReplyTruncated' || key === 'firstRawReplyTruncated' ? bool(v) : uint(v);
  }
  const r = asRecord(s.run), cp = asRecord(s.checkpoint), recovery = asRecord(s.recovery), retained = asRecord(s.retained), deployed = asRecord(s.deployed), attempt = asRecord(s.attempt);
  return {
    version: 1, runId, attemptNumber: uint(s.attemptNumber), observedAt: iso(s.observedAt),
    deployed: { commit: commit(deployed.commit), bootedAt: iso(deployed.bootedAt), provenance: 'current process: environment or cached checkout; historical build unknown' },
    run: { videoKind: enumValue(r.videoKind, ['short', 'long']), targetSeconds: finiteNumber(r.targetSeconds), profileVersionId: diagnosticId(r.profileVersionId), manualVideoRetries: uint(r.manualVideoRetries), maxCostUsd: finiteNumber(r.maxCostUsd) },
    attempt: { stageId: diagnosticId(attempt.stageId), status: enumValue(attempt.status, ['pending', 'running', 'completed', 'failed', 'skipped']), startedAt: iso(attempt.startedAt), completedAt: iso(attempt.completedAt), updatedAt: iso(attempt.updatedAt) },
    failure,
    checkpoint: { availability: enumValue(cp.availability, ['not_persisted', 'invalid', 'bounded', 'persisted']), inputHash: diagnosticHash(cp.inputHash), contractVersion: uint(cp.contractVersion), acceptedSceneCount: uint(cp.acceptedSceneCount),
      sceneIds: array(cp.sceneIds).slice(0, PLANNER_SCENE_LIMIT).filter(v => typeof v === 'string' && /^\d{1,6}:\d{1,6}$/.test(v)), completePlanPresent: bool(cp.completePlanPresent), completePlanInputHash: diagnosticHash(cp.completePlanInputHash), provenance: 'stored keys only; restoration and asset integrity unverified' },
    recovery: { legacyCandidate: bool(recovery.legacyCandidate), legacyEligible: bool(recovery.legacyEligible), legacyUsed: bool(recovery.legacyUsed), recoverableFailure: bool(recovery.recoverableFailure), provenance: 'existing rules; current state and selected attempt; no action authorized' },
    retained: { stillsDone: uint(retained.stillsDone), stillsTotal: uint(retained.stillsTotal), bundleManifestRecorded: bool(retained.bundleManifestRecorded), provenance: 'stored progress hint; no filesystem or asset checks' },
    calls: array(s.calls).slice(0, PLANNER_CALL_LIMIT).map(v => { const c = asRecord(v); return { stageId: diagnosticId(c.stageId), at: iso(c.at), provider: diagnosticLabel(c.provider), model: diagnosticLabel(c.model), inputTokens: uint(c.inputTokens), outputTokens: uint(c.outputTokens), costUsd: finiteNumber(c.costUsd), metadata: plannerCallMetadata(c.metadata) }; }),
    missing: array(s.missing).slice(0, 64).map(v => { const m = asRecord(v); return { field: typeof m.field === 'string' && MISSING_FIELDS.has(m.field) ? m.field : 'unknown', reason: enumValue(m.reason, MISSING_REASONS) ?? 'unavailable (unrecognized reason omitted)' }; }),
    truncated: envelope.truncated === true || s.truncated === true || array(s.calls).length > PLANNER_CALL_LIMIT || array(cp.sceneIds).length > PLANNER_SCENE_LIMIT,
  };
}

export function sanitizeStructure(value: unknown, runId: string) {
  const s = asRecord(value), r = asRecord(s.run);
  if (r.id !== runId) throw new InspectError('STRUCTURE_SCOPE_MISMATCH');
  const stages = array(s.stages), usage = array(s.usage);
  return {
    publishingSummary: sanitizePublishingSummary(s.publishingSummary),
    run: { id: runId, status: enumValue(r.status, ['pending', 'running', 'paused_angle', 'paused_gate1', 'paused_gate2', 'completed', 'failed', 'needs_attention']), currentStage: diagnosticLabel(r.currentStage), profileVersionId: diagnosticId(r.profileVersionId), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) },
    stages: stages.slice(0, 200).map(v => { const t = asRecord(v); return { stageName: diagnosticLabel(t.stageName), attemptNumber: uint(t.attemptNumber), status: enumValue(t.status, ['pending', 'running', 'completed', 'failed', 'skipped']), startedAt: iso(t.startedAt), finishedAt: iso(t.finishedAt), failureSummary: t.reason ? safeValidationError(t.reason) : null }; }),
    usage: usage.slice(0, 200).map(v => { const u = asRecord(v); return { at: iso(u.at), agent: diagnosticLabel(u.agent), provider: diagnosticLabel(u.provider), model: diagnosticLabel(u.model), costUsd: finiteNumber(u.costUsd) }; }),
    totals: { costUsd: finiteNumber(asRecord(s.totals).costUsd), events: uint(asRecord(s.totals).events), zeroCostEvents: uint(asRecord(s.totals).zeroCostEvents) },
    gates: array(s.gates).slice(0, 100).map(v => { const g = asRecord(v); return { gate: g.gate === 1 || g.gate === 2 ? g.gate : null, decision: enumValue(g.decision, ['approve', 'reject', 'revise']), at: iso(g.at) }; }),
    bundle: { attempts: array(asRecord(s.bundle).attempts).slice(0, 100).map(uint).filter(v => v !== null) },
    truncated: stages.length > 200 || usage.length > 200 || array(s.gates).length > 100 || array(asRecord(s.bundle).attempts).length > 100,
  };
}

export function sanitizeSystem(value: unknown) {
  const s = asRecord(value), flags = asRecord(s.flags);
  return { commit: commit(s.commit), bootedAt: iso(s.bootedAt), nodeEnv: enumValue(s.nodeEnv, ['production', 'development', 'test']), uptimeSeconds: uint(s.uptimeSeconds),
    flags: Object.fromEntries(['mediaStub', 'stockFootageStub', 'aiVisualsStub', 'r2Configured', 'openaiConfigured', 'youtubeOauthConfigured'].map(k => [k, bool(flags[k])])),
    provenance: 'environment commit or cached checkout HEAD; no immutable build ID' };
}

// Explicit content mode may show approved narration; redact recognizable private
// identifiers/secrets/URLs and control characters before console or export.
export function sanitizeApprovedText(v: unknown, credential: string): string | null {
  if (typeof v !== 'string') return null;
  return v.slice(0, 40_000).split(credential).join('[redacted]')
    .replace(/https?:\/\/[^\s<>]+/gi, '[url omitted]')
    .replace(/\b[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}\b/gi, '[email omitted]')
    .replace(/(?:Bearer\s+\S+|\b(?:sk-|gho_|eyJ)[a-z0-9._-]+|(?:token|secret|password|api[-_ ]?key)\s*[:=]\s*\S+)/gi, '[redacted]')
    .replace(/\p{Cc}/gu, c => ['\t', '\n', '\r'].includes(c) ? c : '');
}

export function sanitizeContentView(value: unknown, view: ContentView, credential: string) {
  const s = asRecord(value), c = asRecord(s.content);
  if (view === 'approved_script') {
    if (s.kind !== 'stage_output' || s.stageName !== 'gate1') throw new InspectError('CONTENT_SCOPE_MISMATCH');
    const text = sanitizeApprovedText(c.sanctionedScriptText, credential);
    if (c.outcome !== 'approve' || !text) return { view, available: false, reason: 'approved completed script unavailable', truncated: s.truncated === true };
    return { view, available: true, attemptNumber: uint(s.attemptNumber), script: text,
      chapters: array(c.chapters).slice(0, 20).map((v, index) => { const chapter = asRecord(v); return { index, title: sanitizeApprovedText(chapter.title, credential)?.slice(0, 200) ?? null, text: sanitizeApprovedText(chapter.text, credential) }; }),
      truncated: s.truncated === true || (typeof c.sanctionedScriptText === 'string' && c.sanctionedScriptText.length > 40_000) || array(c.chapters).length > 20 || array(c.chapters).some(v => typeof asRecord(v).text === 'string' && (asRecord(v).text as string).length > 40_000) };
  }
  if (view === 'production_plan') {
    if (s.kind !== 'stage_output' || s.stageName !== 'video_generation') throw new InspectError('CONTENT_SCOPE_MISMATCH');
    const plan = asRecord(c.plan ?? asRecord(c.recoveryPlan).plan), checkpoint = asRecord(c.longPlanningCheckpoint), progress = asRecord(c.stillsProgress);
    const ids: string[] = []; let bounded = false, visited = 0;
    for (const key in asRecord(checkpoint.scenes)) {
      if (!Object.hasOwn(asRecord(checkpoint.scenes), key)) continue;
      if (++visited > PLANNER_SCENE_LIMIT) { bounded = true; break; }
      if (/^\d{1,6}:\d{1,6}$/.test(key)) ids.push(key);
    }
    const available = Object.keys(plan).length > 0;
    return { view, available, attemptNumber: uint(s.attemptNumber),
      planSceneCount: Array.isArray(plan.longScenes) ? plan.longScenes.length : null,
      inputHash: diagnosticHash(checkpoint.inputHash), contractVersion: uint(checkpoint.contractVersion),
      acceptedSceneCount: checkpoint.scenes !== null && typeof checkpoint.scenes === 'object' && !Array.isArray(checkpoint.scenes) && !bounded && ids.length === visited ? ids.length : null,
      sceneIds: ids, completePlanInputHash: diagnosticHash(asRecord(c.recoveryPlan).inputHash),
      stillsDone: uint(progress.done), stillsTotal: uint(progress.total),
      reason: available ? 'stored plan summary; restoration and asset integrity unverified' : 'not available through this content view; absence or truncation is not proof of no earlier work',
      truncated: s.truncated === true || bounded };
  }
  if (s.kind !== 'bundle_manifest') throw new InspectError('CONTENT_SCOPE_MISMATCH');
  const permitted = ['plan.json', 'script.txt', 'transcript.json', 'ffmpeg-args.json', 'voiceover.mp3', 'captions.ass', 'stock-shotlist.mp4', 'stills-video.mp4', 'audio-bed.mp3', 'audio-bed.wav'];
  return { view, available: bool(s.available), attemptNumber: uint(s.attemptNumber), createdAt: iso(c.createdAt),
    files: array(c.files).slice(0, 200).flatMap(v => { const file = asRecord(v); return typeof file.name === 'string' && (permitted.includes(file.name) || /^still-\d{1,3}\.png$/.test(file.name)) ? [{ name: file.name, bytes: uint(file.bytes), contentType: enumValue(file.contentType, ['application/json', 'text/plain', 'audio/mpeg', 'audio/wav', 'image/png', 'video/mp4', 'text/x-ssa']) }] : []; }),
    truncated: s.truncated === true || array(c.files).length > 200 };
}

export async function inspectRun(options: InspectOptions, credential: string, transport: InspectTransport = fetch) {
  const selected = validateInspectOptions(options);
  if (!credential || credential.length < 16 || credential.length > 8192 || !/^[a-zA-Z0-9._~+/-]+=*$/.test(credential)) throw new InspectError('EXISTING_ADMIN_CREDENTIAL_UNAVAILABLE');
  const queries = { system: 'admin.system.info', structure: 'admin.runs.get' } as const;
  // Method/procedure/input are composed here, never accepted from a caller.
  async function request(operation: 'system' | 'structure' | 'diagnostics' | ContentView): Promise<unknown> {
    const isQuery = operation === 'system' || operation === 'structure';
    const procedure = isQuery ? queries[operation] : 'admin.runs.content';
    const input = operation === 'system' ? undefined : operation === 'structure' ? { runId: selected.runId }
      : operation === 'diagnostics' ? { runId: selected.runId, kind: 'planner_diagnostics', attemptNumber: selected.attemptNumber }
      : operation === 'approved_script' ? { runId: selected.runId, kind: 'stage_output', stageName: 'gate1' }
      : operation === 'production_plan' ? { runId: selected.runId, kind: 'stage_output', stageName: 'video_generation', attemptNumber: selected.attemptNumber }
      : { runId: selected.runId, kind: 'bundle_manifest', attemptNumber: selected.attemptNumber };
    const url = new URL(`/trpc/${procedure}`, selected.baseUrl);
    if (isQuery && input) url.searchParams.set('input', JSON.stringify(superjson.serialize(input)));
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), INSPECT_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await transport(url, { method: isQuery ? 'GET' : 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: isQuery ? undefined : JSON.stringify(superjson.serialize(input)), redirect: 'error', signal: controller.signal });
      if (response.redirected || (response.url && new URL(response.url).href !== url.href) || (response.status >= 300 && response.status < 400)) throw new InspectError('REDIRECT_REJECTED');
      if (!response.ok) throw new InspectError(response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'HTTP_REQUEST_FAILED', response.status);
      const declared = Number(response.headers.get('content-length'));
      if (declared > INSPECT_RESPONSE_MAX_BYTES) throw new InspectError('RESPONSE_TOO_LARGE');
      if (!response.body) throw new InspectError('EMPTY_RESPONSE');
      reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > INSPECT_RESPONSE_MAX_BYTES) throw new InspectError('RESPONSE_TOO_LARGE');
        chunks.push(chunk.value);
      }
      const wire = asRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (wire.error) throw new InspectError('RPC_REQUEST_FAILED');
      const data = asRecord(wire.result).data;
      if (!data) throw new InspectError('INVALID_RPC_RESPONSE');
      return superjson.deserialize(data as Parameters<typeof superjson.deserialize>[0]);
    } catch (error) {
      if (error instanceof InspectError) throw error;
      throw new InspectError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'TRANSPORT_OR_WIRE_FAILED');
    } finally { clearTimeout(timer); if (reader) await reader.cancel().catch(() => undefined); }
  }
  const results: Record<string, unknown> = {};
  const status: Array<{ operation: string; available: boolean; code?: string; httpStatus?: number | null }> = [];
  // Sequential bounded views; each audited POST is exactly one explicit operation.
  for (const op of ['system', 'structure', 'diagnostics', ...(selected.contentView ? [selected.contentView] : [])] as const) {
    try {
      const data = await request(op);
      results[op] = op === 'system' ? sanitizeSystem(data) : op === 'structure' ? sanitizeStructure(data, selected.runId)
        : op === 'diagnostics' ? sanitizePlannerResponse(data, selected.runId, selected.attemptNumber) : sanitizeContentView(data, op, credential);
      status.push({ operation: op, available: true });
    } catch (error) {
      const e = error instanceof InspectError ? error : new InspectError('SANITIZER_REJECTED_RESPONSE');
      status.push({ operation: op, available: false, code: e.code, httpStatus: e.httpStatus });
      if (e.code === 'UNAUTHORIZED' || e.code === 'FORBIDDEN') break;
    }
  }
  const report = { version: 1, runId: selected.runId, observedAt: new Date().toISOString(), baseUrl: selected.baseUrl, status, results, truncated: Object.values(results).some(v => asRecord(v).truncated === true) };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > INSPECT_EXPORT_MAX_BYTES) {
    // Preserve small summaries/status; never slice structured JSON or private content.
    delete results.approved_script; delete results.bundle_manifest; delete results.production_plan;
    const structure = asRecord(results.structure); if (structure.usage) structure.usage = [];
    report.truncated = true;
    status.push({ operation: 'export', available: false, code: 'EXPORT_CONTENT_OMITTED_AT_BYTE_LIMIT' });
  }
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > INSPECT_EXPORT_MAX_BYTES) {
    delete results.diagnostics;
    status.push({ operation: 'diagnostics', available: false, code: 'EXPORT_DIAGNOSTICS_OMITTED_AT_BYTE_LIMIT' });
  }
  // A received token in an allowlisted string is still never allowed to leave.
  return JSON.parse(JSON.stringify(report).split(credential).join('[redacted]')) as typeof report;
}

export function parseInspectArguments(args: string[]): InspectOptions & { exportFile?: string } {
  const allowed = new Set(['--base-url', '--run', '--attempt', '--content', '--export']);
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!allowed.has(flag) || values[flag] !== undefined || !value || value.startsWith('--')) throw new InspectError('INVALID_ARGUMENTS');
    values[flag] = value;
  }
  if (values['--attempt'] !== undefined && !/^[1-9]\d*$/.test(values['--attempt'])) throw new InspectError('INVALID_ATTEMPT');
  if (values['--export'] !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(values['--export'])) throw new InspectError('EXPORT_FILENAME_REQUIRED');
  return { ...validateInspectOptions({ baseUrl: values['--base-url'] ?? 'https://7aistudio.tech', runId: values['--run'] ?? '', attemptNumber: values['--attempt'] ? Number(values['--attempt']) : undefined, contentView: values['--content'] as ContentView | undefined }), exportFile: values['--export'] };
}

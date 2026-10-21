import { z } from 'zod';

export const PLANNER_CALL_LIMIT = 100;
export const PLANNER_SCENE_LIMIT = 200;
export const PLANNER_CONTENT_MAX_BYTES = 200 * 1024;
export const PLANNER_STRING_LIMIT = 300;
export type DiagnosticScalar = string | number | boolean | null;
export const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const finiteNumber = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const integer = (v: unknown): number | null => {
  const n = finiteNumber(v);
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const bool = (v: unknown): boolean | null => typeof v === 'boolean' ? v : null;
export const diagnosticHash = (v: unknown): string | null => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v) ? v : null;
export const diagnosticId = (v: unknown): string | null => typeof v === 'string' && z.string().uuid().safeParse(v).success ? v : null;
export const diagnosticLabel = (v: unknown): string | null =>
  typeof v === 'string' && v.length <= 100 && /^[a-z0-9][a-z0-9._:/-]*$/i.test(v) && !/token|secret|session|sk-|https?:/i.test(v) ? v : null;
const choice = (v: unknown, choices: readonly string[]): string | null => typeof v === 'string' && choices.includes(v) ? v : null;
export const STOP_REASONS = ['stop', 'length', 'unknown', 'end_turn', 'max_tokens', 'tool_use', 'content_filter'] as const;
export const FAILURE_KINDS = ['spend_limit', 'provider_capacity', 'rate_limit_exhausted', 'provider_auth', 'output_token_exhaustion', 'count_mismatch', 'scene_anchor_mismatch', 'schema_violation', 'malformed_json', 'duplicate_scene_id'] as const;

// Error text may quote rejected content, chapter titles, secrets or provider bodies.
// Keep only diagnostics reconstructed from known grammar; never forward arbitrary text.
export function safeValidationError(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const text = v.slice(0, 4000);
  const count = text.match(/received (\d{1,6}) scenes, exactly (\d{1,6}) were requested/);
  if (count) return `received ${count[1]} scenes, exactly ${count[2]} were requested`;
  if (/output cap|output_token_exhaustion|cut off at the output cap/.test(text)) return 'output cap reached';
  if (/^Spend limit reached:/i.test(text)) return 'spend limit reached';
  if (/^Retry limit reached for this step/.test(text)) return 'manual retry cap reached';
  if (/scene anchors must match/.test(text)) return 'scene anchors must match';
  if (/JSON|Unexpected|Expected|Unterminated/.test(text)) return 'JSON parsing failed (private details omitted)';
  return 'validation failed (private details omitted)';
}

export const CALL_METADATA_KEYS = ['contractVersion', 'chapterIndex', 'sceneOffset', 'sceneCount', 'requestKind', 'requestHash', 'maxTokens', 'reusedSceneCount', 'finishReason', 'validationOutcome', 'validationError', 'recoveryStrategy'] as const;
export function plannerCallMetadata(v: unknown): Record<typeof CALL_METADATA_KEYS[number], DiagnosticScalar> {
  const s = asRecord(v);
  return {
    contractVersion: integer(s.contractVersion), chapterIndex: integer(s.chapterIndex),
    sceneOffset: integer(s.sceneOffset), sceneCount: integer(s.sceneCount),
    requestKind: choice(s.requestKind, ['initial', 'correction']), requestHash: diagnosticHash(s.requestHash),
    maxTokens: integer(s.maxTokens), reusedSceneCount: integer(s.reusedSceneCount),
    finishReason: choice(s.finishReason, STOP_REASONS),
    validationOutcome: choice(s.validationOutcome, ['accepted', ...FAILURE_KINDS]),
    validationError: safeValidationError(s.validationError),
    recoveryStrategy: choice(s.recoveryStrategy, ['accept', 'correct', 'split', 'escalate']),
  };
}

export type PlannerDiagnostics = {
  version: 1; runId: string; attemptNumber: number; observedAt: string;
  deployed: { commit: string | null; bootedAt: string; provenance: string };
  run: { videoKind: string | null; targetSeconds: number | null; profileVersionId: string | null; manualVideoRetries: number | null; maxCostUsd: number | null };
  attempt: { stageId: string; status: string | null; startedAt: string | null; completedAt: string | null; updatedAt: string };
  failure: Record<string, DiagnosticScalar>;
  checkpoint: { availability: string; inputHash: string | null; contractVersion: number | null; acceptedSceneCount: number | null; sceneIds: string[]; completePlanPresent: boolean | null; completePlanInputHash: string | null; provenance: string };
  recovery: { legacyCandidate: boolean | null; legacyEligible: boolean | null; legacyUsed: boolean | null; recoverableFailure: boolean | null; provenance: string };
  retained: { stillsDone: number | null; stillsTotal: number | null; bundleManifestRecorded: boolean | null; provenance: string };
  calls: Array<{ stageId: string; at: string; provider: string | null; model: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; metadata: Record<string, DiagnosticScalar> }>;
  missing: Array<{ field: string; reason: string }>; truncated: boolean;
};
export type PlannerSource = {
  runId: string; attemptNumber: number; profileVersionId: unknown; creationOptions: unknown;
  stageId: string; status: string; startedAt: string | null; completedAt: string | null; updatedAt: string;
  output: unknown; error: string | null;
  deployed: { commit: string | null; bootedAt: string }; recovery: PlannerDiagnostics['recovery'];
  calls: Array<{ stageId: string | null; createdAt: string; provider: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; metadata: unknown }>;
};

export function projectPlannerDiagnostics(s: PlannerSource): PlannerDiagnostics {
  const missing: PlannerDiagnostics['missing'] = [];
  let truncated = s.calls.length > PLANNER_CALL_LIMIT;
  const absent = (field: string, reason: string) => { if (missing.length < 64) missing.push({ field, reason }); };
  const o = asRecord(s.output), checkpoint = asRecord(o.longPlanningCheckpoint), options = asRecord(s.creationOptions);
  const sceneMapPresent = checkpoint.scenes !== null && typeof checkpoint.scenes === 'object' && !Array.isArray(checkpoint.scenes);
  const scenes = asRecord(checkpoint.scenes), sceneIds: string[] = [];
  let count = 0, visited = 0, malformed = false, scenesTruncated = false;
  // Never traverse scene values (prompts/narration) or accept arbitrary keys as IDs.
  for (const key in scenes) {
    if (!Object.hasOwn(scenes, key)) continue;
    if (++visited > PLANNER_SCENE_LIMIT) { truncated = true; scenesTruncated = true; break; }
    if (!/^\d{1,6}:\d{1,6}$/.test(key)) { malformed = true; continue; }
    count++; sceneIds.push(key);
  }
  sceneIds.sort((a, b) => { const x = a.split(':').map(Number), y = b.split(':').map(Number); return x[0] - y[0] || x[1] - y[1]; });
  const inputHash = diagnosticHash(checkpoint.inputHash), contractVersion = integer(checkpoint.contractVersion);
  const checkpointPresent = Object.hasOwn(o, 'longPlanningCheckpoint');
  if (!checkpointPresent) absent('checkpoint', 'not persisted on this attempt; absence is not evidence of no earlier work');
  if (checkpointPresent && !sceneMapPresent) absent('checkpoint.sceneIds', 'missing or malformed checkpoint scene map; accepted count unknown');
  if (checkpointPresent && !inputHash) absent('checkpoint.inputHash', 'missing or invalid persisted hash');
  if (checkpointPresent && contractVersion === null) absent('checkpoint.contractVersion', 'not persisted in legacy checkpoint; no version inferred');
  if (scenesTruncated) absent('checkpoint.sceneIds', 'truncated at 200 scene IDs; acceptedSceneCount unknown beyond this bound');
  if (malformed) absent('checkpoint.sceneIds', 'unrecognized persisted scene IDs omitted; accepted count unknown');
  const plan = asRecord(o.recoveryPlan), progress = asRecord(o.stillsProgress);
  const storedPlan = o.plan ?? plan.plan;
  const completePlanPresent = storedPlan !== null && typeof storedPlan === 'object' && !Array.isArray(storedPlan) && Object.keys(storedPlan).length > 0 ? true : null;
  if (completePlanPresent === null) absent('checkpoint.completePlanPresent', 'not persisted on this attempt; storage presence does not prove restoration');
  const recovery = asRecord(o.recovery);
  const kind = choice(o.failureKind, FAILURE_KINDS) ?? choice(recovery.kind, FAILURE_KINDS)
    ?? (/^Spend limit reached:/i.test(s.error ?? '') ? 'spend_limit'
      : /received \d+ scenes, exactly \d+ were requested/.test(s.error ?? '') ? 'count_mismatch'
      : /cut off at the output cap/.test(s.error ?? '') ? 'output_token_exhaustion' : null);
  const failure: Record<string, DiagnosticScalar> = {
    classification: kind, stopReason: choice(o.stopReason, STOP_REASONS), firstStopReason: choice(o.firstStopReason, STOP_REASONS),
    parseError: safeValidationError(o.parseError), firstParseError: safeValidationError(o.firstParseError),
    replyLength: integer(o.replyLength), firstReplyLength: integer(o.firstReplyLength),
    rawReplyTruncated: bool(o.rawReplyTruncated), firstRawReplyTruncated: bool(o.firstRawReplyTruncated),
    attempts: integer(o.attempts), plannerContractVersion: integer(o.plannerContractVersion),
    chapterIndex: integer(o.chapterIndex), sceneOffset: integer(o.sceneOffset), sceneCount: integer(o.sceneCount),
    requestHash: diagnosticHash(o.requestHash), requestKind: choice(o.requestKind, ['initial', 'correction']),
    maxTokens: integer(o.maxTokens), reusedSceneCount: integer(o.reusedSceneCount),
    recoveryStrategy: choice(o.recoveryStrategy, ['accept', 'correct', 'split', 'escalate']),
  };
  for (const [key, prefix] of [['parseError', 'final'], ['firstParseError', 'first']] as const) {
    const m = typeof o[key] === 'string' ? (o[key] as string).slice(0, 4000).match(/received (\d{1,6}) scenes, exactly (\d{1,6}) were requested/) : null;
    failure[`${prefix}ReceivedSceneCount`] = m ? Number(m[1]) : null;
    failure[`${prefix}RequestedSceneCount`] = m ? Number(m[2]) : null;
  }
  if (failure.chapterIndex === null) {
    const chapter = s.error?.slice(0, 4000).match(/Video production planning for chapter ([0-9]{1,6}) /);
    if (chapter) failure.chapterIndex = Number(chapter[1]) - 1;
  }
  for (const [key, value] of Object.entries(failure)) {
    if (value === null) absent(`failure.${key}`, 'not persisted or not applicable; never reconstructed from a raw reply');
  }
  const run = {
    videoKind: choice(asRecord(options.resolvedOptions).videoKind ?? options.videoKind, ['short', 'long']),
    targetSeconds: finiteNumber(asRecord(asRecord(options.resolvedOptions).targetSeconds).value ?? options.targetDurationSec),
    profileVersionId: diagnosticId(s.profileVersionId),
    manualVideoRetries: integer(asRecord(options.manualRetries).video_generation), maxCostUsd: finiteNumber(options.maxCostUsd),
  };
  for (const [k, v] of Object.entries(run)) if (v === null) absent(`run.${k}`, 'not recorded; current defaults are not historical evidence');
  if (s.recovery.legacyUsed === null) absent('recovery.legacyUsed', 'one-use marker not recorded; null is not false');
  if (s.recovery.legacyEligible === null) absent('recovery.legacyEligible', 'unavailable: current eligibility prerequisites could not be safely established');
  const calls = s.calls.slice(0, PLANNER_CALL_LIMIT).map(c => ({
    stageId: c.stageId ?? s.stageId, at: c.createdAt, provider: diagnosticLabel(c.provider), model: diagnosticLabel(c.model),
    inputTokens: integer(c.inputTokens), outputTokens: integer(c.outputTokens), costUsd: finiteNumber(c.costUsd), metadata: plannerCallMetadata(c.metadata),
  }));
  if (!calls.length) absent('calls', 'no planner usage rows linked to this attempt; absence does not prove no reused plan');
  if (calls.some(c => Object.values(c.metadata).every(v => v === null))) absent('calls.metadata', 'legacy call metadata not persisted; provider request/reply tails unavailable');
  for (const key of CALL_METADATA_KEYS) {
    if (key !== 'validationError' && calls.some(c => c.metadata[key] === null)) absent(`calls.metadata.${key}`, 'not persisted or invalid on one or more planner usage rows');
  }
  if (calls.some(c => c.inputTokens === null || c.outputTokens === null)) absent('calls.tokens', 'token counts not persisted on one or more usage rows');
  if (s.calls.length > PLANNER_CALL_LIMIT) absent('calls', 'database query bounded to 100 rows plus one truncation sentinel; remaining calls omitted');
  if (diagnosticHash(plan.inputHash) === null) absent('checkpoint.completePlanInputHash', 'not persisted on this attempt; storage presence does not prove restoration');
  if (integer(progress.total) === null) absent('retained.stillsTotal', 'not persisted; progress is a hint, not verified asset integrity');
  if (integer(progress.done) === null) absent('retained.stillsDone', 'not persisted; progress is a hint, not verified asset integrity');
  absent('retained.artifactFiles', 'not read: use explicit audited bundle_manifest; only manifest-listed files establish bundle presence');
  if (!s.deployed.commit) absent('deployed.commit', 'runtime revision unavailable');
  absent('attempt.deployedCommit', 'historical attempt revision not persisted; deployed describes the current diagnostic process only');
  const result: PlannerDiagnostics = {
    version: 1, runId: s.runId, attemptNumber: s.attemptNumber, observedAt: new Date().toISOString(),
    deployed: { bootedAt: s.deployed.bootedAt, commit: typeof s.deployed.commit === 'string' && /^[0-9a-f]{4,40}$/i.test(s.deployed.commit) ? s.deployed.commit : null, provenance: 'current process: GIT_COMMIT or cached checkout HEAD; not immutable build or historical attempt provenance' },
    run, attempt: { stageId: s.stageId, status: diagnosticLabel(s.status), startedAt: s.startedAt, completedAt: s.completedAt, updatedAt: s.updatedAt },
    failure, checkpoint: { availability: !checkpointPresent ? 'not_persisted' : !inputHash || !sceneMapPresent ? 'invalid' : scenesTruncated || malformed ? 'bounded' : 'persisted',
      inputHash, contractVersion, acceptedSceneCount: checkpointPresent && sceneMapPresent && !scenesTruncated && !malformed ? count : null,
      sceneIds, completePlanPresent, completePlanInputHash: diagnosticHash(plan.inputHash), provenance: 'stored keys only; no prompt, narration, asset validation or restoration performed' },
    recovery: s.recovery, retained: { stillsDone: integer(progress.done), stillsTotal: integer(progress.total),
      bundleManifestRecorded: typeof o.r2ManifestKey === 'string' ? o.r2ManifestKey.length > 0 : null,
      provenance: 'stored still-progress hint and manifest marker; no filesystem inspection or inferred asset flags' },
    calls, missing, truncated,
  };
  // Keep structured JSON even if future additive fields grow; never return a cut JSON string.
  while (Buffer.byteLength(JSON.stringify(result), 'utf8') > PLANNER_CONTENT_MAX_BYTES && result.calls.length) {
    result.calls.pop(); result.truncated = true;
    if (!result.missing.some(m => m.reason === '200 KiB response cap')) absent('calls', '200 KiB response cap');
  }
  return result;
}

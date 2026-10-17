import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { env } from '../config/env';
import { DATA_DIR } from '../config/paths';
import { NonTransientStageError } from './retry-with-backoff';
import { renderProfileFor } from '../agents/video-generation/render-profile';
import { ProductionPlanSchema, type ProductionPlan } from '../agents/video-generation/plan';
import type { FactualBaseline } from '../content-evidence/packet';

const exec = promisify(execFile);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const VisualDefectSchema = z.object({
  sceneId: z.string().max(80).optional(),
  timestampSeconds: z.number().finite().nonnegative().optional(),
  kind: z.enum(['visual_mismatch', 'continuity', 'composition', 'artifact']),
  reason: z.string().min(1).max(500),
  requiredVisualConstraints: z.array(z.string().min(1).max(300)).max(4).default([]),
}).strict();
export type VisualDefect = z.infer<typeof VisualDefectSchema>;

const MappingSceneSchema = z.object({
  sceneId: z.string().min(1), chapterIndex: z.number().int().nonnegative(),
  imagePath: z.string().min(1), imageSha256: hex,
  promptSha256: hex, styledPromptSha256: hex,
  sourceSceneId: z.string().min(1), substituted: z.boolean(),
  frameStart: z.number().int().nonnegative(), frameEndExclusive: z.number().int().positive(),
  startSec: z.number().finite().nonnegative(), endSec: z.number().finite().positive(),
  anchor: z.string(),
}).passthrough();
export const SceneMappingSchema = z.object({
  version: z.literal(1), fps: z.number().positive(), scenes: z.array(MappingSceneSchema).min(1).max(300),
}).strict();
export type SceneMapping = z.infer<typeof SceneMappingSchema>;

export const RepairReceiptSchema = z.object({
  version: z.literal(1), runId: z.string().min(1), baselineAttempt: z.number().int().positive(),
  repairAttempt: z.number().int().positive(), sceneId: z.string().min(1), chapterIndex: z.number().int().nonnegative(),
  defect: VisualDefectSchema,
  baseline: z.object({ factualFingerprint: hex, planSha256: hex, mappingSha256: hex,
    voice: z.string(), renderSha256: hex, timingSha256: hex, audioSha256: hex, subtitlesSha256: hex }).strict(),
  status: z.enum(['intent', 'replacement-ready', 'rendered']),
  replacement: z.object({ path: z.string().min(1), sha256: hex, provider: z.string(), costUsd: z.number().nonnegative() }).strict().optional(),
  videoSha256: hex.optional(),
}).strict();
export type RepairReceipt = z.infer<typeof RepairReceiptSchema>;

export const sha256Bytes = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fail = (reason: string): never => { throw new NonTransientStageError(`Visual-only repair unavailable: ${reason}`); };
export function assertUnder(parent: string, child: string): string {
  const resolved = path.resolve(child);
  const rel = path.relative(path.resolve(parent), resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) fail('asset path escapes the run work area');
  return resolved;
}
export async function assertActualUnder(parent: string, child: string): Promise<string> {
  const resolved = assertUnder(parent, child);
  try { assertUnder(await fs.realpath(parent), await fs.realpath(resolved)); }
  catch { return fail('asset symlink or path escapes the run work area'); }
  return resolved;
}
async function bytes(file: string): Promise<Buffer> {
  try {
    const value = await fs.readFile(file);
    if (!value.length) fail(`required baseline asset is empty: ${path.basename(file)}`);
    return value;
  } catch (error) {
    if (error instanceof NonTransientStageError) throw error;
    return fail(`required baseline asset is missing: ${path.basename(file)}`);
  }
}

export function resolveDefect(mapping: SceneMapping, defects: VisualDefect[]): { defect: VisualDefect; scene: SceneMapping['scenes'][number] } {
  if (defects.length !== 1) fail('exactly one located visual defect is required');
  const parsed = VisualDefectSchema.parse(defects[0]);
  const instructions = [parsed.reason, ...parsed.requiredVisualConstraints].join(' ');
  if (/\b(script|narration|voice|audio|caption|subtitle|wording|fact|claim|quote|year|date)\b|\b\d{3,4}\b/i.test(instructions)) {
    fail('defect may require a factual, narration or timing correction');
  }
  if (!parsed.sceneId && parsed.timestampSeconds === undefined) fail('a scene ID or sampled timestamp is required');
  const byId = parsed.sceneId ? mapping.scenes.find(s => s.sceneId === parsed.sceneId) : undefined;
  const byTime = parsed.timestampSeconds !== undefined
    ? mapping.scenes.find(s => s.startSec <= parsed.timestampSeconds! && parsed.timestampSeconds! < s.endSec) : undefined;
  if (parsed.sceneId && !byId) fail(`unknown scene ID ${parsed.sceneId}`);
  if (parsed.timestampSeconds !== undefined && !byTime) fail('sampled timestamp is outside the mapped scenes');
  if (byId && byTime && byId.sceneId !== byTime.sceneId) fail('scene ID conflicts with sampled timestamp');
  const scene = byId ?? byTime!;
  if (mapping.scenes.filter(s => s.sceneId === scene.sceneId).length !== 1) fail('duplicate scene ID in baseline map');
  if (scene.substituted) fail('moderation-substituted scene is unresolved');
  return { defect: { ...parsed, sceneId: scene.sceneId }, scene };
}

export async function inspectImage(file: string, expected: { width: number; height: number }): Promise<string> {
  const data = await bytes(file);
  let width: number; let height: number;
  try {
    const probe = await exec(env.FFPROBE_PATH, ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'json', file]);
    const parsed = JSON.parse(probe.stdout) as { streams?: Array<{ width?: number; height?: number }> };
    width = parsed.streams?.[0]?.width ?? 0; height = parsed.streams?.[0]?.height ?? 0;
    await exec(env.FFMPEG_PATH, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'null', '-']);
  } catch { return fail(`image cannot be decoded: ${path.basename(file)}`); }
  if (width !== expected.width || height !== expected.height) fail(`image dimensions changed: ${path.basename(file)}`);
  return sha256Bytes(data);
}

export type RepairBaselineInput = {
  runId: string; baselineAttempt: number; repairAttempt: number;
  previousInput: { factualBaseline?: FactualBaseline; resolvedVoice?: string };
  currentInput: { factualBaseline?: FactualBaseline; resolvedVoice?: string };
  previousOutput: { plan?: ProductionPlan; chapterTimings?: unknown; videoKind?: string;
    frameCount?: number | null; fps?: number; width?: number; height?: number; videoPath?: string };
  defect: VisualDefect;
  rootDir?: string;
  inspect?: typeof inspectImage;
};
export type PreparedRepair = { receipt: RepairReceipt; mapping: SceneMapping; outputDir: string;
  audioPath: string; subtitlesPath: string; transcriptPath: string; receiptPath: string };

export async function prepareVisualRepair(input: RepairBaselineInput): Promise<PreparedRepair> {
  if (input.repairAttempt <= input.baselineAttempt || input.repairAttempt > input.baselineAttempt + 2) fail('repair exceeds the bounded revision attempt window');
  const former = input.previousInput.factualBaseline;
  const current = input.currentInput.factualBaseline;
  if (!former || !current || former.fingerprint !== current.fingerprint) return fail('evidence or approved script fingerprint changed or is missing');
  const voice = input.currentInput.resolvedVoice;
  if (!voice || input.previousInput.resolvedVoice !== voice) return fail('resolved voice changed or is missing');
  const plan = input.previousOutput.plan;
  if (input.previousOutput.videoKind !== 'long' || !plan || plan.visualSource !== 'ai-stills' || !plan.longScenes?.length) return fail('baseline is not a long-form AI-stills render');
  if (!ProductionPlanSchema.safeParse(plan).success || !plan.sceneMeanings) return fail('baseline lacks a valid stable scene contract');
  const planScenes = plan.longScenes;
  const outputDir = path.resolve(input.rootDir ?? path.join(DATA_DIR, 'videos'), input.runId);
  const mappingPath = path.join(outputDir, `${input.baselineAttempt}.scene-mapping.json`);
  let mapping: SceneMapping;
  try { mapping = SceneMappingSchema.parse(JSON.parse((await bytes(mappingPath)).toString('utf8'))); }
  catch { return fail('Task 3 scene mapping is absent or invalid'); }
  if (mapping.scenes.length !== planScenes.length) fail('scene mapping no longer matches the plan');
  if (new Set(mapping.scenes.map(s => s.sceneId)).size !== mapping.scenes.length) fail('baseline mapping has duplicate scene IDs');
  const { defect, scene } = resolveDefect(mapping, [input.defect]);
  if (plan.sceneMeanings?.scenes?.[mapping.scenes.indexOf(scene)]?.sceneId !== scene.sceneId) fail('scene ID no longer matches the approved plan');
  const profile = renderProfileFor('long');
  if (mapping.fps !== profile.fps || input.previousOutput.fps !== profile.fps ||
    input.previousOutput.width !== profile.width || input.previousOutput.height !== profile.height) fail('render profile changed');
  let lastFrame = 0;
  for (const [i, mapped] of mapping.scenes.entries()) {
    if (mapped.frameStart !== lastFrame || mapped.frameEndExclusive <= mapped.frameStart ||
      mapped.chapterIndex !== planScenes[i].chapterIndex || mapped.anchor !== planScenes[i].words ||
      mapped.promptSha256 !== sha256Bytes(planScenes[i].prompt)) fail('baseline scene timing or prompt is incompatible');
    lastFrame = mapped.frameEndExclusive;
  }
  if (input.previousOutput.frameCount !== lastFrame) fail('baseline frame total changed');
  const baselineVideo = input.previousOutput.videoPath;
  if (!baselineVideo || await assertActualUnder(input.rootDir ?? DATA_DIR, baselineVideo) !== path.join(outputDir, `${input.baselineAttempt}.mp4`)) {
    return fail('completed baseline video path is missing or unexpected');
  }
  await bytes(baselineVideo);
  const inspect = input.inspect ?? inspectImage;
  for (const mapped of mapping.scenes) {
    const p = await assertActualUnder(input.rootDir ?? DATA_DIR, mapped.imagePath);
    const hash = await inspect(p, { width: 1536, height: 1024 });
    if (hash !== mapped.imageSha256) fail(`baseline image changed: ${mapped.sceneId}`);
  }
  const audioPath = path.join(outputDir, 'work', `mixed-${input.baselineAttempt}.m4a`);
  const subtitlesPath = path.join(outputDir, `${input.baselineAttempt}.srt`);
  const transcriptPath = path.join(outputDir, `${input.baselineAttempt}.transcript.json`);
  const audioSha256 = sha256Bytes(await bytes(audioPath));
  const subtitlesSha256 = sha256Bytes(await bytes(subtitlesPath));
  await bytes(transcriptPath);
  const receipt: RepairReceipt = {
    version: 1, runId: input.runId, baselineAttempt: input.baselineAttempt,
    repairAttempt: input.repairAttempt, sceneId: scene.sceneId, chapterIndex: scene.chapterIndex, defect,
    baseline: { factualFingerprint: current.fingerprint, planSha256: sha256Bytes(JSON.stringify(plan)),
      mappingSha256: sha256Bytes(await bytes(mappingPath)), voice,
      renderSha256: sha256Bytes(JSON.stringify(profile)),
      timingSha256: sha256Bytes(JSON.stringify({ scenes: mapping.scenes.map(s => [s.sceneId, s.frameStart, s.frameEndExclusive]),
        chapters: input.previousOutput.chapterTimings })), audioSha256, subtitlesSha256 },
    status: 'intent',
  };
  return { receipt, mapping, outputDir, audioPath, subtitlesPath, transcriptPath,
    receiptPath: path.join(outputDir, 'work', `repair-${input.repairAttempt}.json`) };
}

export async function saveRepairReceipt(file: string, receipt: RepairReceipt): Promise<void> {
  const value = RepairReceiptSchema.parse(receipt);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.partial`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx' });
  await fs.rename(temp, file);
}
export async function recoverRepairReceipt(file: string, intent: RepairReceipt): Promise<RepairReceipt> {
  let saved: RepairReceipt;
  try { saved = RepairReceiptSchema.parse(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch { return intent; }
  if (JSON.stringify({ ...saved, status: 'intent', replacement: undefined, videoSha256: undefined }) !==
      JSON.stringify({ ...intent, status: 'intent', replacement: undefined, videoSha256: undefined })) {
    return fail('stored repair receipt does not match the current baseline');
  }
  return saved;
}

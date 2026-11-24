import type { ResolvedDirection } from '../../channel-profile/resolve';
import { directionBlock } from '../../channel-direction/prompts';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { env } from '../../config/env';
import { callLLM, extractJsonText, type LLMResponse, type RetryGuard } from '../../llm';

const execFileAsync = promisify(execFile);

// Sprint 5 Task 8 (R6): the picture-level safeguard. Every still is looked at once, before the video is
// rendered, for four things the image model keeps doing on its own: brand logos and lettering, readable
// text, invented figures and slogans, and a scene that says something different from the narration line
// it illustrates (an abandoned ruin under "the parks were sold"). Video Review samples three to twelve
// frames and cannot do this job (run 7a90cd6e: about 12 of 24 stills carried a logo or invented text and
// the review passed all of it).
//
// Cost: stills are shrunk to 640 px before they are sent and checked six at a time on the cheap vision
// tier, about $0.012 for a 2-minute video (decision D3: budget $0.02). A result is cached with the still,
// so a retry or a second attempt never pays to check the same picture twice.

export const STILL_CHECK_BATCH = 6;
export const STILL_CHECK_THUMB_WIDTH = 640;

export const STILL_ISSUE_KINDS = ['logo', 'text', 'invented_figure', 'contradiction'] as const;
export type StillIssueKind = (typeof STILL_ISSUE_KINDS)[number];
export type StillIssue = { kind: StillIssueKind; detail: string };

export type StillToCheck = {
  sceneIndex: number;
  imagePath: string;
  // The narration this picture illustrates.
  narration: string;
};

export type StillCheckResult = { sceneIndex: number; checked: boolean; issues: StillIssue[] };

const ReplySchema = z.object({
  results: z.array(
    z.object({
      image: z.number().int().min(1),
      issues: z.array(z.object({ kind: z.enum(STILL_ISSUE_KINDS), detail: z.string().min(1) })).default([]),
    }),
  ),
});

export const STILL_CHECK_SYSTEM_PROMPT = `You inspect AI-generated still images for a video, one numbered image at a time. Each image comes with the narration line it illustrates. Report only real problems, in these kinds:
- "logo": any brand logo, wordmark, trademark or brand name, including on a sign, building, product, packaging or screen.
- "text": any readable letters, words or numbers anywhere in the picture (signs, screens, documents, banners, labels). Blurred, tiny or unreadable marks are fine.
- "invented_figure": a chart, table, calculator display, document or slogan that shows figures or statements the picture should not be inventing.
- "contradiction": the picture shows something that conflicts with, or implies a fact beyond, its narration line. Decay, abandonment, closure, ruin, disaster or mourning imagery (an overgrown or empty site, a flag at half-mast) is a contradiction unless the narration says it. Showing the stated fact or a neutral scene is fine.
Be strict about "logo" and "text". Do not report style, quality or taste. Respond with ONLY JSON: {"results": [{"image": 1, "issues": [{"kind": "logo" | "text" | "invented_figure" | "contradiction", "detail": "what and where, in a few words"}]}]} with one entry per image and an empty issues array when the image is fine. Raw JSON only.`;

export function buildStillCheckSystemPrompt(direction?: ResolvedDirection, visualStyle?: string | null): string {
  return STILL_CHECK_SYSTEM_PROMPT + directionBlock(direction, ['visualReviewTone']) + (visualStyle ? `\nVisual style: ${visualStyle}` : '');
}

async function thumbnailBase64(imagePath: string): Promise<string> {
  const out = `${imagePath}.check.jpg`;
  await execFileAsync(env.FFMPEG_PATH, [
    '-y', '-v', 'error', '-i', imagePath, '-vf', `scale=${STILL_CHECK_THUMB_WIDTH}:-2`, '-frames:v', '1', '-q:v', '5', out,
  ]);
  return (await fs.readFile(out)).toString('base64');
}

async function fileKey(imagePath: string, narration: string, system: string, topic: string): Promise<string> {
  const bytes = await fs.readFile(imagePath);
  return createHash('sha256').update(bytes).update('\u0000').update(narration).update('\u0000').update(system).update('\u0000').update(topic).digest('hex').slice(0, 32);
}

type Cached = { issues: StillIssue[] };

export type StillCheckDeps = {
  // The vision call. Injected so tests never reach a provider.
  ask: (system: string, content: string, imagesBase64: string[], retryGuard?: RetryGuard) => Promise<LLMResponse>;
  thumbnail: (imagePath: string) => Promise<string>;
};

export const defaultStillCheckDeps: StillCheckDeps = {
  ask: (system, content, imagesBase64, retryGuard) =>
    callLLM({
      purpose: 'still-check',
      retryGuard,
      system,
      messages: [{ role: 'user', content, attachments: imagesBase64.map((dataBase64) => ({ mediaType: 'image/jpeg', dataBase64 })) }],
    }),
  thumbnail: thumbnailBase64,
};

// Checks every still not already checked. `onCall` is told about each paid vision call (to book it);
// `beforeCall` may throw to stop (a spend limit). A reply that cannot be read leaves that batch
// unchecked: a checker that fails must not fail a video, and the stills stay marked unchecked.
export async function checkStills(params: {
  topic: string;
  direction?: ResolvedDirection;
  visualStyle?: string | null;
  stills: StillToCheck[];
  cacheDir: string;
  deps?: StillCheckDeps;
  beforeCall?: () => Promise<void>;
  onCall?: (llm: LLMResponse, info: { batchSize: number }) => Promise<void>;
  // LLM Registry task (R5): the stage's budget check, asked before every extra provider call of a vision call.
  retryGuard?: RetryGuard;
}): Promise<StillCheckResult[]> {
  const deps = params.deps ?? defaultStillCheckDeps;
  const results = new Map<number, StillCheckResult>();
  const pending: Array<StillToCheck & { key: string }> = [];
  const system = buildStillCheckSystemPrompt(params.direction, params.visualStyle);

  for (const still of params.stills) {
    const key = await fileKey(still.imagePath, still.narration, system, params.topic);
    try {
      const cached = JSON.parse(await fs.readFile(`${params.cacheDir}/${key}.check.json`, 'utf-8')) as Cached;
      results.set(still.sceneIndex, { sceneIndex: still.sceneIndex, checked: true, issues: cached.issues });
    } catch {
      pending.push({ ...still, key });
    }
  }

  for (let i = 0; i < pending.length; i += STILL_CHECK_BATCH) {
    const batch = pending.slice(i, i + STILL_CHECK_BATCH);
    await params.beforeCall?.();
    const images = await Promise.all(batch.map((s) => deps.thumbnail(s.imagePath)));
    const content = `Topic: ${params.topic}\n\n${batch.map((s, k) => `Image ${k + 1} narration: ${s.narration}`).join('\n')}`;
    const llm = await deps.ask(system, content, images, params.retryGuard);
    await params.onCall?.(llm, { batchSize: batch.length });
    let parsed: z.infer<typeof ReplySchema> | null = null;
    try {
      const candidate = ReplySchema.safeParse(JSON.parse(extractJsonText(llm.text)));
      parsed = candidate.success ? candidate.data : null;
    } catch {
      parsed = null;
    }
    batch.forEach((s, k) => {
      const entry = parsed?.results.find((r) => r.image === k + 1);
      if (!entry) {
        results.set(s.sceneIndex, { sceneIndex: s.sceneIndex, checked: false, issues: [] });
        return;
      }
      results.set(s.sceneIndex, { sceneIndex: s.sceneIndex, checked: true, issues: entry.issues });
    });
    await Promise.all(
      batch.map(async (s) => {
        const r = results.get(s.sceneIndex);
        if (r?.checked) await fs.writeFile(`${params.cacheDir}/${s.key}.check.json`, JSON.stringify({ issues: r.issues } satisfies Cached), 'utf-8').catch(() => undefined);
      }),
    );
  }
  return params.stills.map((s) => results.get(s.sceneIndex) ?? { sceneIndex: s.sceneIndex, checked: false, issues: [] });
}

// The instruction added to a picture that failed its check, for its one regeneration.
export function strongerPrompt(prompt: string, issues: StillIssue[]): string {
  const problems = issues.map((i) => `${i.kind.replace('_', ' ')}: ${i.detail}`).join('; ');
  return `${prompt} STRICT REWRITE after a failed check (${problems}). Remove every sign, label, screen, document, banner and product marking from the picture, or show them as blank or out of focus. No letters, no numbers, no logos, no brand names anywhere. Show only what the story states, or a neutral scene; no ruins, decay, closure or mourning imagery.`;
}

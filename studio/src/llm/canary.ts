// LLM Registry task, Part B (R8): `npm run llm:canary -- --yes [--ceiling 1] [--out table.md]`
//
// One real call per purpose with a small fixed fixture, then a table of tokens used against the limit, so a
// registry change or a model change shows its effect before it reaches a run. The fixtures are the ones the
// stages already use: the NIYT S-1 Short and L-1 Long briefs (docs/channel_bibles/NIYT_CHANNEL_CONFIG.md,
// Appendix A) with the channel settings of section 7, read from that file at run time. Each step is fed by the
// step before it (the brief through intake, the script through review and planning) the way a run is, so the
// sizes are the real ones. Nothing here writes content.
//
// It spends real money, so: it refuses to run without --yes, stops before a call once the running total has
// reached the ceiling ($1 unless --ceiling says otherwise), and refuses outside the dev environment
// (canary-support.ts). It writes nothing to any database.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import '../config/env'; // loads .env.local before anything reads the environment
import { callLLM, extractJsonObjectText, type LLMCallEvidence, type LLMResponse } from './index';
import { getStageErrorContext } from '../run-pipeline/retry-with-backoff';
import { LLM_REGISTRY } from './registry';
import {
  assertConfirmed,
  assertDevEnvironment,
  formatNearMisses,
  formatTable,
  parseCanaryArgs,
  solidPng,
  type CanaryRow,
} from './canary-support';
import { parseBrief } from '../run-pipeline/parse-brief';
import { generateScript, type ScriptGenerationOutput } from '../agents/script-generation';
import { reviewScript } from '../agents/script-review';
import { planVideoProduction } from '../agents/video-generation/plan';
import { planLongVideoProduction } from '../agents/video-generation/plan-long';
import { generatePublishingMetadata } from '../agents/publishing';
import { buildSystemPrompt as buildVideoReviewPrompt } from '../agents/video-intelligence';
import type { IntakeParsed } from '../types';

const DOC = path.join(__dirname, '..', '..', '..', 'docs', 'channel_bibles', 'NIYT_CHANNEL_CONFIG.md');

type Brief = { brief: string };
type Settings = {
  styleGuide: string;
  bannedOpeners: string[];
  bannedEndings: string[];
  nicheDescription: string;
  titleGuidance: string;
  hashtagsBase: string[];
  visualStyle: string;
};

function readSpec() {
  const doc = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
  const fence = (from: string, to: string): Brief => {
    const start = doc.indexOf(from);
    const end = to ? doc.indexOf(to, start) : doc.length;
    const block = doc.slice(start, end < 0 ? doc.length : end).match(/```\n([\s\S]*?)\n```/);
    if (!block) throw new Error(`No brief block under "${from}" in ${DOC}`);
    return { brief: block[1] };
  };
  const row = (name: string) => {
    const match = doc.match(new RegExp(`\\|\\s*\\|?\\s*${name}\\s*\\|\\s*([^|]+)\\|`));
    if (!match) throw new Error(`No "${name}" row in ${DOC}`);
    return match[1].trim().replace(/^`|`$/g, '');
  };
  const settings: Settings = {
    styleGuide: doc
      .slice(doc.indexOf('**Style guide (`guide`'), doc.indexOf('**Description template'))
      .split('\n')
      .filter((l) => l.startsWith('>'))
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim(),
    bannedOpeners: row('bannedOpeners').split(' · ').map((x) => x.trim()),
    bannedEndings: row('bannedEndings').split(' · ').map((x) => x.trim()),
    nicheDescription: doc.match(/\| Niche \| ([^|]+) \|/)?.[1].trim() ?? 'History',
    titleGuidance: row('titleGuidance'),
    hashtagsBase: row('hashtagsBase').split(/\s+/).filter(Boolean),
    visualStyle: row('stylePrompt'),
  };
  return { s1: fence('## S-1: Short', '## L-1: Long'), l1: fence('## L-1: Long', '\n# Appendix B'), settings };
}

const argv = process.argv.slice(2);
const args = parseCanaryArgs(argv);
const rows: CanaryRow[] = [];
let spentUsd = 0;
const t0 = Date.now();

class CeilingReached extends Error {}
class StopAfterFirstBatch extends Error {}

function ceilingGuard(before: string) {
  if (spentUsd >= args.ceilingUsd) {
    throw new CeilingReached(`Spend ceiling $${args.ceilingUsd.toFixed(2)} reached before ${before} (spent $${spentUsd.toFixed(4)}).`);
  }
}

// One row per provider call that was billed: the cut-off ones first (priorAttempts), then the reply.
function record(purpose: string, fixture: string, llm: LLMResponse) {
  for (const call of [...(llm.priorAttempts ?? []), llm]) {
    const e: LLMCallEvidence | undefined = call.evidence;
    const limit = call.maxOutputTokens;
    const out = call.usage.outputTokens;
    const cost = Number(call.costUsd);
    spentUsd += cost;
    rows.push({
      purpose,
      fixture,
      model: call.model,
      limit,
      outputTokens: out,
      reasoningTokens: call.usage.reasoningTokens ?? null,
      percentUsed: e?.percentUsed ?? Math.round((out / limit) * 1000) / 10,
      stopReason: call.stopReason,
      costUsd: cost,
      ms: e?.durationMs ?? 0,
      nearMiss: e?.nearMiss ?? out >= limit * 0.6,
    });
  }
}

// A step that failed after its calls were paid for still spent money and still shows how big the replies were:
// the calls callLLM attached to the error become rows too (fixture marked "failed step").
function recordFailedCalls(purpose: string, fixture: string, error: unknown) {
  const calls = getStageErrorContext(error)?.calls;
  if (!Array.isArray(calls)) return;
  for (const call of calls as Array<{ model: string; outputTokens: number; costUsd: string; metadata?: { llm?: LLMCallEvidence } }>) {
    const e = call.metadata?.llm;
    if (!e) continue;
    spentUsd += Number(call.costUsd);
    rows.push({
      purpose, fixture: `${fixture} (failed step)`, model: call.model, limit: e.limit, outputTokens: call.outputTokens,
      reasoningTokens: e.reasoningTokens, percentUsed: e.percentUsed, stopReason: e.stopReason, costUsd: Number(call.costUsd),
      ms: e.durationMs, nearMiss: e.nearMiss,
    });
  }
}

async function step<T>(name: string, run: () => Promise<T>, onFail?: (error: unknown) => T | undefined): Promise<T | undefined> {
  ceilingGuard(name);
  try {
    return await run();
  } catch (error) {
    if (error instanceof CeilingReached) throw error;
    recordFailedCalls(name.split(' ')[0], name.split(' ').slice(1).join(' '), error);
    console.error(`[canary] ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    return onFail?.(error);
  }
}
const failures: string[] = [];

// Findings of the first canary run (see the report): the L-1 brief asks for seven chapters and the long-form
// rule accepts three to six, so Script Generation rejects the reply it asked for. The canary still needs the
// script's size to measure review and planning, so it reads the rejected reply as the model wrote it. The row
// names this so nobody reads it as a script a run would have produced.
function salvageRejectedLongScript(error: unknown): ScriptGenerationOutput | undefined {
  const raw = getStageErrorContext(error)?.rawReply;
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(extractJsonObjectText(raw)) as { chapters?: Array<{ title: string; text: string }>; hashtags?: string[] };
    const chapters = (parsed.chapters ?? []).map((c) => ({ title: c.title.trim(), text: c.text.trim() }));
    if (chapters.length === 0) return undefined;
    salvaged = true;
    return { scriptText: chapters.map((c) => c.text).join('\n\n'), captions: '', hashtags: parsed.hashtags ?? [], chapters };
  } catch {
    return undefined;
  }
}
let salvaged = false;

async function main() {
  assertConfirmed(args);
  assertDevEnvironment({ NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL });
  const { s1, l1, settings } = readSpec();
  console.log(`llm:canary - dev environment, ceiling $${args.ceilingUsd.toFixed(2)}, models: ${[...new Set(Object.values(LLM_REGISTRY).map((e) => e.model))].join(', ')}\n`);

  // The stage guard of the real runs is a budget check against a database; the canary has no run, so its own
  // ceiling is checked before every step and before every extra call.
  const retryGuard = async () => (spentUsd >= args.ceilingUsd ? `the canary's $${args.ceilingUsd.toFixed(2)} ceiling is reached` : null);

  // ---- intake-parsing: both briefs, as a run would start ----
  const intake: Record<string, IntakeParsed | undefined> = {};
  for (const [id, brief] of [['S-1', s1], ['L-1', l1]] as const) {
    intake[id] = (await step(`intake-parsing ${id}`, async () => {
      const result = await parseBrief(brief.brief, retryGuard);
      record('intake-parsing', id, result.llm);
      return result.output;
    })) ?? undefined;
  }

  // ---- script-generation: S-1 Short (45 s) and L-1 Long (10 min) ----
  const scripts: Record<string, ScriptGenerationOutput | undefined> = {};
  for (const [id, brief, kind, seconds] of [['S-1', s1, 'short', 45], ['L-1', l1, 'long', 600]] as const) {
    const parsed = intake[id];
    if (!parsed) continue;
    scripts[id] = await step(`script-generation ${id}`, async () => {
      const result = await generateScript({
        topic: parsed.topic,
        constraints: parsed.constraints,
        styleGuide: settings.styleGuide,
        targetSeconds: seconds,
        briefText: brief.brief,
        factPolicy: 'brief-only',
        bannedOpeners: settings.bannedOpeners,
        bannedEndings: settings.bannedEndings,
        retryGuard,
        ...(kind === 'long' && { videoKind: 'long' as const }),
      });
      for (const call of result.calls) record('script-generation', id, call);
      return result.output;
    }, (error) => (id === 'L-1' ? salvageRejectedLongScript(error) : undefined));
  }

  // ---- script-review ----
  for (const [id, brief, kind, seconds] of [['S-1', s1, 'short', 45], ['L-1', l1, 'long', 600]] as const) {
    const script = scripts[id];
    if (!script) continue;
    await step(`script-review ${id}${id === 'L-1' && salvaged ? ' (rejected 7-chapter script)' : ''}`, async () => {
      const result = await reviewScript({
        scriptText: script.scriptText,
        captions: script.captions,
        nicheDescription: settings.nicheDescription,
        styleGuide: settings.styleGuide,
        briefText: brief.brief,
        targetSeconds: seconds,
        bannedOpeners: settings.bannedOpeners,
        bannedEndings: settings.bannedEndings,
        retryGuard,
        ...(kind === 'long' && { videoKind: 'long' as const, chapterTitles: (script.chapters ?? []).map((c) => c.title) }),
      });
      record('script-review', id === 'L-1' && salvaged ? 'L-1 (rejected 7-chapter script)' : id, result.llm);
    });
  }

  // ---- video-production-planning: the S-1 plan, and one batch of the L-1 plan (12 scenes, the largest request) ----
  if (scripts['S-1'] && intake['S-1']) {
    await step('video-production-planning S-1', async () => {
      const result = await planVideoProduction({
        scriptText: scripts['S-1']!.scriptText,
        topic: intake['S-1']!.topic,
        visualSourceOverride: 'ai-stills',
        desiredStillCount: 9,
        retryGuard,
      });
      record('video-production-planning', 'S-1', result.llm);
    });
  }
  if (scripts['L-1']?.chapters && intake['L-1']) {
    await step('video-production-planning L-1 (first batch)', async () => {
      let recorded = false;
      try {
        await planLongVideoProduction({
          chapters: scripts['L-1']!.chapters!,
          topic: intake['L-1']!.topic,
          targetSeconds: 600,
          secondsPerStill: 5,
          visualStyle: settings.visualStyle,
          scriptGuide: settings.styleGuide,
          retryGuard,
          beforeCall: async () => ceilingGuard('video-production-planning L-1 batch'),
          onCall: async (llm) => {
            record('video-production-planning', `L-1 batch 1 (12 scenes)${salvaged ? ', rejected 7-chapter script' : ''}`, llm);
            recorded = true;
            throw new StopAfterFirstBatch();
          },
        });
      } catch (error) {
        if (!(error instanceof StopAfterFirstBatch)) throw error;
      }
      if (!recorded) throw new Error('the long planner made no call');
    });
  }

  // ---- metadata-generation ----
  if (scripts['S-1']) {
    await step('metadata-generation S-1', async () => {
      const result = await generatePublishingMetadata({
        scriptText: scripts['S-1']!.scriptText,
        hashtags: scripts['S-1']!.hashtags,
        titleGuidance: settings.titleGuidance,
        hashtagsBase: settings.hashtagsBase,
        retryGuard,
      });
      record('metadata-generation', 'S-1', result.llm);
    });
  }

  // ---- video-intelligence-own-draft: the real review prompt with one attached frame ----
  if (scripts['S-1'] && intake['S-1']) {
    await step('video-intelligence-own-draft S-1', async () => {
      const llm = await callLLM({
        purpose: 'video-intelligence-own-draft',
        system: buildVideoReviewPrompt('ai-stills', true),
        messages: [
          {
            role: 'user',
            content: `Topic: ${intake['S-1']!.topic}\nScript: ${scripts['S-1']!.scriptText}`,
            attachments: [{ mediaType: 'image/png', dataBase64: solidPng(540, 960, [122, 98, 70]).toString('base64') }],
          },
        ],
        retryGuard,
      });
      record('video-intelligence-own-draft', 'S-1 (one plain frame)', llm);
    });
  }
}

async function finish(stoppedEarly?: string) {
  const table = formatTable(rows);
  const text = [
    `llm:canary table (${new Date().toISOString()}, ${Math.round((Date.now() - t0) / 1000)} s)`,
    '',
    table,
    '',
    formatNearMisses(rows),
    ...(failures.length > 0 ? ['', 'steps that failed (their own error, no row):', ...failures.map((f) => `- ${f}`)] : []),
    ...(stoppedEarly ? ['', `STOPPED EARLY: ${stoppedEarly}`] : []),
  ].join('\n');
  console.log(`\n${text}`);
  if (args.out) writeFileSync(args.out, `${text}\n`);
  return failures.length === 0 && !stoppedEarly ? 0 : 1;
}

// Only when run as the command (npm run llm:canary), never when something imports this file.
if (require.main === module) {
  main().then(
    async () => process.exit(await finish()),
    async (error: unknown) => {
      if (error instanceof CeilingReached) {
        process.exit(await finish(error.message));
      }
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}

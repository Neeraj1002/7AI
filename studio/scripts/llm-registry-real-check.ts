// LLM Registry task, Part A, R4 step 3: the real check, on the dev database (never sevenai_preview).
//   npx tsx scripts/llm-registry-real-check.ts [--ceiling 1]
//
// 1. Runs the NIYT S-1 Short (docs/channel_bibles/NIYT_CHANNEL_CONFIG.md, Appendix A, with the channel
//    settings of section 7 as the fixture, read from that file at run time) through Script Generation and
//    Video Planning with real calls and prints tokens used against the limit, reasoning tokens and stop
//    reason per call.
// 2. Forces one purpose's output limit very low, in this process only (the registry object is mutated here;
//    nothing in the API or production config can do that), and drives the real Script Generation stage on
//    a dev run, once where the automatic retry recovers and once where it is cut off twice. Prints the
//    usage events and the text `runs.get` returns.
//
// It spends real money (a few cents) and stops before a call once the running total passes the ceiling.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';
import { LLM_REGISTRY } from '../src/llm/registry';
import type { LLMResponse } from '../src/llm';
import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../src/config/env';
import { generateScript, buildSystemPrompt, buildUserMessage, ScriptGenerationOutputSchema } from '../src/agents/script-generation';
import { planVideoProduction } from '../src/agents/video-generation/plan';
import { createRun, runIntakeStage, runScriptGenerationStage } from '../src/run-pipeline/state-machine';
import { appRouter } from '../src/api/router';
import { callProviderModel } from '../src/llm/client';
import { z } from 'zod';

const ceilingArg = process.argv.indexOf('--ceiling');
const CEILING_USD = ceilingArg > -1 ? Number(process.argv[ceilingArg + 1]) : 1;
let spent = 0;
const guard = (label: string) => {
  if (spent >= CEILING_USD) throw new Error(`Spend ceiling $${CEILING_USD} reached before ${label} (spent $${spent.toFixed(4)}).`);
};
const book = (llm: LLMResponse) => {
  for (const call of [...(llm.priorAttempts ?? []).map((p) => p.costUsd), llm.costUsd]) spent += Number(call);
};

const docPath = path.join(__dirname, '..', '..', 'docs', 'channel_bibles', 'NIYT_CHANNEL_CONFIG.md');
const doc = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n');

function fixture() {
  const s1 = doc.slice(doc.indexOf('## S-1: Short'), doc.indexOf('## L-1: Long'));
  const block = s1.match(/```\n([\s\S]*?)\n```/)![1];
  const lines = block.split('\n');
  const topicLine = lines.find((l) => l.startsWith('Topic:'))!;
  const constraints = lines.filter((l) => l.startsWith('Constraint:')).map((l) => l.replace(/^Constraint:\s*/, ''));
  const guide = doc
    .slice(doc.indexOf('**Style guide (`guide`'), doc.indexOf('**Description template'))
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
  const row = (name: string) => doc.match(new RegExp(`\\|\\s*\\|?\\s*${name}\\s*\\|\\s*([^|]+)\\|`))![1].trim();
  return {
    brief: block,
    topic: topicLine.replace(/^Topic:\s*/, '').split(' Pictures:')[0],
    constraints,
    styleGuide: guide,
    bannedOpeners: row('bannedOpeners').split(' · ').map((x) => x.trim()),
    bannedEndings: row('bannedEndings').split(' · ').map((x) => x.trim()),
  };
}

function describe(label: string, llm: LLMResponse) {
  const calls = [...(llm.priorAttempts ?? []), llm];
  for (const [i, c] of calls.entries()) {
    const usage = 'usage' in c ? c.usage : (c as LLMResponse).usage;
    const limit = c.maxOutputTokens;
    console.log(
      `${label.padEnd(18)} call ${i + 1}/${calls.length}  model=${c.model}  outputTokens=${usage.outputTokens}/${limit} (${((usage.outputTokens / limit) * 100).toFixed(1)}%)  reasoningTokens=${usage.reasoningTokens ?? 'n/a'}  stopReason=${c.stopReason}  cost=$${c.costUsd}`,
    );
  }
}

// What the code did before this task, reproduced for the evidence: the same S-1 request at the old 4,096-token
// cap with the provider's default reasoning (no thinking setting sent).
async function reproOld() {
  const f = fixture();
  guard('repro');
  console.log('\n== Repro: the old request (cap 4096, no thinking setting, claude-sonnet-5)');
  const params = { topic: f.topic, constraints: f.constraints, styleGuide: f.styleGuide, targetSeconds: 45, briefText: f.brief, factPolicy: 'brief-only' as const, bannedOpeners: f.bannedOpeners, bannedEndings: f.bannedEndings };
  const result = await generateText({
    model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })('claude-sonnet-5'),
    system: buildSystemPrompt('brief-only', false),
    messages: [{ role: 'user', content: buildUserMessage(params) }],
    maxOutputTokens: 4096,
    maxRetries: 0,
    output: Output.object({ schema: ScriptGenerationOutputSchema }),
  }).then((r) => ({ text: r.text, usage: r.usage, finishReason: r.finishReason, raw: r.rawFinishReason, content: r.content.map((c) => c.type) }))
    .catch((e: { text?: string; usage?: unknown; finishReason?: string; message: string }) => ({ text: e.text ?? '', usage: e.usage, finishReason: e.finishReason ?? 'error', raw: e.message.slice(0, 80), content: [] as string[] }));
  console.log(`old request: finishReason=${result.finishReason} replyLength=${result.text.length} usage=${JSON.stringify(result.usage)} parts=${JSON.stringify(result.content)}`);
}

// The retry after a cut-off asks for up to 32,000 tokens, which the provider documents as needing a stream.
// Prove the streaming path with a real, tiny request on each model family in use, structured and plain.
async function streamCheck() {
  console.log('\n== Stream check: real streamed requests at 32,000 tokens (tiny prompts)');
  for (const model of ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-sonnet-5-5']) {
    for (const structured of [true, false]) {
      guard('stream check');
      const out = await callProviderModel({
        provider: 'anthropic',
        model,
        system: 'Reply with JSON only.',
        messages: [{ role: 'user', content: 'Return {"word":"ok"}.' }],
        maxOutputTokens: 32_000,
        reasoning: 'off',
        stream: true,
        ...(structured ? { outputSchema: z.object({ word: z.string() }) } : {}),
      });
      spent += Number(out.costUsd);
      console.log(`${model} ${structured ? 'structured' : 'plain'} streamed: stopReason=${out.stopReason} outputTokens=${out.usage.outputTokens} reasoningTokens=${out.usage.reasoningTokens ?? 'n/a'} text=${out.text.slice(0, 40)}`);
    }
  }
}

async function part1() {
  const f = fixture();
  console.log(`\n== Part 1: S-1 through Script Generation and Video Planning (limit script-generation=${LLM_REGISTRY['script-generation'].maxOutputTokens}, video-production-planning=${LLM_REGISTRY['video-production-planning'].maxOutputTokens})`);
  guard('script generation');
  const script = await generateScript({
    topic: f.topic,
    constraints: f.constraints,
    styleGuide: f.styleGuide,
    targetSeconds: 45,
    briefText: f.brief,
    factPolicy: 'brief-only',
    bannedOpeners: f.bannedOpeners,
    bannedEndings: f.bannedEndings,
  });
  for (const llm of script.calls) { book(llm); describe('script-generation', llm); }
  console.log(`script: ${script.output.scriptText.split(/\s+/).length} words; first sentence: ${script.output.scriptText.slice(0, 80)}...`);

  guard('video planning');
  const plan = await planVideoProduction({ scriptText: script.output.scriptText, topic: f.topic, visualSourceOverride: 'ai-stills', desiredStillCount: 9 });
  book(plan.llm);
  describe('video-planning', plan.llm);
  console.log(`plan: visualSource=${plan.plan.visualSource}, stills=${plan.plan.stillScenePrompts?.length}`);
}

async function stageDemo(label: string, limit: number) {
  const f = fixture();
  guard(label);
  const entry = LLM_REGISTRY['script-generation'];
  const original = entry.maxOutputTokens;
  const channel =
    (await prisma.channel.findFirst({ where: { tenantId: MVP_TENANT_ID, isActive: true } })) ??
    (await prisma.channel.create({ data: { tenantId: MVP_TENANT_ID, platform: 'youtube', name: 'LLM registry real-check channel', nicheDescription: 'Fixture for scripts/llm-registry-real-check.ts' } }));
  const run = await createRun({ tenantId: channel.tenantId, channelId: channel.id, briefText: f.brief, creationOptions: { targetDurationSec: 45 } });
  console.log(`\n== ${label}: dev run ${run.id}, script-generation limit forced to ${limit} in this process (registry says ${original})`);
  await runIntakeStage(run.id);
  entry.maxOutputTokens = limit;
  try {
    await runScriptGenerationStage(run.id);
  } finally {
    entry.maxOutputTokens = original;
  }
  const events = await prisma.usageEvent.findMany({ where: { pipelineRunId: run.id }, orderBy: { createdAt: 'asc' } });
  console.log('usage events:');
  for (const e of events) {
    console.log(`  ${e.agent.padEnd(18)} ${e.model}  in=${e.inputTokens} out=${e.outputTokens}  cost=$${e.costUsd}`);
    spent += Number(e.costUsd);
  }
  const caller = appRouter.createCaller({ tenantId: MVP_TENANT_ID, userId: null, role: 'owner', identityKind: 'ops-token' });
  const detail = await caller.runs.get({ id: run.id });
  const stage = detail.stages.filter((s) => s.stageName === 'script_generation').slice(-1)[0];
  console.log(`runs.get: run.status=${detail.run.status} run.currentStage=${detail.run.currentStage}`);
  console.log(`runs.get run.lastError: ${detail.run.lastError ?? '(none)'}`);
  console.log(`runs.get script_generation stage: status=${stage?.status} error=${stage?.error ?? '(none)'}`);
  return run.id;
}

async function main() {
  if (process.argv.includes('--stream-check')) await streamCheck();
  if (process.argv.includes('--repro-old')) await reproOld();
  if (!process.argv.includes('--skip-part1')) await part1();
  await stageDemo('Demo A (recovers on the automatic retry)', 330);
  await stageDemo('Demo B (cut off twice)', 120);
  console.log(`\nTotal spent (summed from the calls above): $${spent.toFixed(4)} of the $${CEILING_USD} ceiling`);
}

main().then(
  async () => { await prisma.$disconnect(); process.exit(0); },
  async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); },
);

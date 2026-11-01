import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Prompt tidy-up (hot-fix): every prompt a model receives must stay byte-identical while duplicated text is
// moved into shared constants. The golden file was captured on main before any change; UPDATE_PROMPT_GOLDENS=1
// rewrites it (only ever do that on purpose, in a change that is meant to alter a prompt).
const llm = vi.hoisted(() => ({ calls: [] as { purpose: string; system: string }[] }));
vi.mock('../llm', async (orig) => ({
  ...(await orig<typeof import('../llm')>()),
  callLLM: vi.fn(async (req: { purpose: string; system: string }) => {
    llm.calls.push({ purpose: req.purpose, system: req.system });
    throw new Error('stop after capture');
  }),
}));

import { buildSystemPrompt } from './script-generation';
import { buildLongSystemPrompt } from './script-generation/long-form';
import { SYSTEM_PROMPT as SHORT_REVIEW, LONG_FORM_SYSTEM_PROMPT as LONG_REVIEW } from './script-review';
import { reviewRules } from './script-review/rules';
import { CONFIRM_SYSTEM_PROMPT, confirmHardCaps } from './script-review/hard-cap-confirmation';
import { STILL_CHECK_SYSTEM_PROMPT, defaultStillCheckDeps } from './video-generation/still-check';
import { generatePublishingMetadata } from './publishing';

const FILE = join(__dirname, 'prompt-goldens.json');

async function capture(): Promise<Record<string, string>> {
  const out: Record<string, string> = {
    'script-short/base': buildSystemPrompt('brief-plus-common', false),
    'script-short/brief-only': buildSystemPrompt('brief-only', false),
    'script-short/packet-default': buildSystemPrompt('brief-plus-common', true),
    'script-short/packet-brief-only': buildSystemPrompt('brief-only', true),
    'script-long/source': buildLongSystemPrompt(false),
    'script-long/packet': buildLongSystemPrompt(true),
    'review-short/prompt': SHORT_REVIEW,
    'review-long/prompt': LONG_REVIEW,
    'review-short/assembled': SHORT_REVIEW + reviewRules(false),
    'review-long/assembled': LONG_REVIEW + reviewRules(true),
    'hard-cap-confirmation': CONFIRM_SYSTEM_PROMPT,
    'still-check': STILL_CHECK_SYSTEM_PROMPT,
  };
  for (const videoKind of ['short', 'long'] as const) {
    llm.calls.length = 0;
    await generatePublishingMetadata({ scriptText: 's', hashtags: [], videoKind }).catch(() => undefined);
    out[`metadata-${videoKind}`] = llm.calls[0].system;
  }
  return out;
}

describe('prompts are byte-identical to the captured goldens', () => {
  it('matches every golden', async () => {
    const now = await capture();
    if (process.env.UPDATE_PROMPT_GOLDENS === '1' || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const golden = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>;
    expect(Object.keys(now).sort()).toEqual(Object.keys(golden).sort());
    for (const key of Object.keys(golden)) expect(now[key], key).toBe(golden[key]);
  });
});

describe('the two checks that own a registry purpose', () => {
  it('the still check asks as still-check, with its prompt unchanged', async () => {
    llm.calls.length = 0;
    await defaultStillCheckDeps.ask(STILL_CHECK_SYSTEM_PROMPT, 'x', []).catch(() => undefined);
    expect(llm.calls).toEqual([{ purpose: 'still-check', system: STILL_CHECK_SYSTEM_PROMPT }]);
  });

  it('the hard-cap confirmation asks as hard-cap-confirmation, with its prompt unchanged', async () => {
    const seen: { purpose: string; system: string }[] = [];
    const complete = (async (req: { purpose: string; system: string }) => { seen.push({ purpose: req.purpose, system: req.system }); throw new Error('stop'); }) as never;
    await confirmHardCaps({ findings: ['SR-1: "The bridge opened in 1901."'], brief: 'b', script: 'The bridge opened in 1901.', complete, calls: [] }).catch(() => undefined);
    expect(seen).toEqual([{ purpose: 'hard-cap-confirmation', system: CONFIRM_SYSTEM_PROMPT }]);
  });
});

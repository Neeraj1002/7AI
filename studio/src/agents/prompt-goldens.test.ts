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

import { buildUserMessage as writerUser, buildSystemPrompt } from './script-generation';
import { buildLongSystemPrompt } from './script-generation/long-form';
import { buildUserMessage as reviewUser, buildReviewSystemPrompt, SYSTEM_PROMPT as SHORT_REVIEW, LONG_FORM_SYSTEM_PROMPT as LONG_REVIEW } from './script-review';
import { CONFIRM_SYSTEM_PROMPT, confirmHardCaps } from './script-review/hard-cap-confirmation';
import { buildStillCheckSystemPrompt, STILL_CHECK_SYSTEM_PROMPT, defaultStillCheckDeps } from './video-generation/still-check';
import { generatePublishingMetadata } from './publishing';
import { buildSystemPrompt as buildShortPlanPrompt } from './video-generation/plan';
import { buildSystemPrompt as buildLongPlanPrompt } from './video-generation/plan-long';
import { buildSystemPrompt as buildFrameReviewPrompt } from './video-intelligence';
import {
  BRIEF_SYSTEM, CONCEPTS_SYSTEM, COLD_READER_SYSTEM,
  briefUser, conceptsUser, coldReaderUser, thumbnailPrompt, renderScript,
} from '../packaging/prompts';
import {
  DEFECT_SYSTEM, CRITIC_SYSTEM, PAYOFF_SYSTEM, COMPARE_SYSTEM,
  defectUser, criticUser, payoffUser, compareUser,
} from '../packaging/prompts-vision';
import type { Concept } from '../packaging/schemas';

import { DIRECTION_PRESETS } from '../channel-direction/presets';
import { resolveChannelConfig } from '../channel-profile/resolve';
import { CONTENT_FORMATS, findFormat } from '../formats/manifest';

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
    'review-short/assembled': buildReviewSystemPrompt({}),
    'review-long/assembled': buildReviewSystemPrompt({ videoKind: 'long' }),
    'hard-cap-confirmation': CONFIRM_SYSTEM_PROMPT,
    'still-check': STILL_CHECK_SYSTEM_PROMPT,
    'plan-short/free': buildShortPlanPrompt(undefined, undefined, 6),
    'plan-short/fixed': buildShortPlanPrompt('stock-footage', 'none', 6),
    'plan-long/free': buildLongPlanPrompt({}),
    'plan-long/fixed': buildLongPlanPrompt({ visualStyle: 'plain', scriptGuide: 'clear', audioLayerOverride: 'none' }),
    'frame-short/stills': buildFrameReviewPrompt('ai-stills', true),
    'frame-short/stock': buildFrameReviewPrompt('stock-footage', false),
    'frame-long/stills': buildFrameReviewPrompt('ai-stills', true, { frameCount: 4 }),
    'packaging/brief-system': BRIEF_SYSTEM,
    'packaging/concepts-system': CONCEPTS_SYSTEM,
    'packaging/cold-reader-system': COLD_READER_SYSTEM,
    'packaging/brief-user': briefUser('A test script.', { titleGuidance: 'Plain titles' }),
    'packaging/concepts-user': conceptsUser('A test script.', { question: 'How?' }, { titleGuidance: 'Plain titles', stylePrompt: 'Watercolour' }, 80, 'figure', ['no clear subject']),
    'packaging/cold-reader-user': coldReaderUser([{ index: 1, title: 'A test title', lettering: 'ONE WORD' }]),
    'packaging/thumbnail-prompt': thumbnailPrompt({ thumbnail: {
      subject: 'a workshop', gazeOrGesture: 'seen from above', scale: 'room-sized',
      threatOrMystery: 'one closed door', light: 'morning', composition: 'door on the left',
      lettering: { zone: 'right' },
    } } as Concept, { stylePrompt: 'Watercolour' }, 'figure'),
    'packaging/render-script': renderScript('', [{ title: 'First', text: 'A test script.' }]),
    'packaging/defect-system': DEFECT_SYSTEM,
    'packaging/critic-system': CRITIC_SYSTEM,
    'packaging/payoff-system': PAYOFF_SYSTEM,
    'packaging/compare-system': COMPARE_SYSTEM,
    'packaging/defect-user': defectUser(),
    'packaging/critic-user': criticUser('A test title'),
    'packaging/payoff-user': payoffUser({ renderedScript: 'A test script.', title: 'A test title', lettering: 'ONE WORD', question: 'How?', answeredAtQuote: 'A test script.' }),
    'packaging/compare-user': compareUser('Title A', 'Title B'),
  };
  out['formats/manifest'] = JSON.stringify(CONTENT_FORMATS, null, 2);
  for (const preset of DIRECTION_PRESETS) {
    const { direction } = resolveChannelConfig({ profile: { direction: { preset: preset.key, note: 'Use a measured voice.' } } });
    const prefix = `direction/${preset.key}`;
    for (const packet of [false, true]) {
      for (const policy of ['brief-only', 'brief-plus-common'] as const) {
        out[`${prefix}/writer-short/${policy}/${packet ? 'packet' : 'source'}`] = buildSystemPrompt(policy, packet, direction);
      }
      out[`${prefix}/writer-long/${packet ? 'packet' : 'source'}`] = buildLongSystemPrompt(packet, undefined, direction);
    }
    for (const videoKind of ['short', 'long'] as const) {
      out[`${prefix}/review-${videoKind}`] = buildReviewSystemPrompt({ direction, videoKind });
      out[`${prefix}/writer-${videoKind}/user`] = writerUser({ direction, videoKind, topic: 'A test topic', constraints: ['Keep the supplied facts.'], briefText: 'A supplied fact.', styleGuide: 'Plain language.', bannedOpeners: ['Welcome'], bannedEndings: ['Subscribe'], targetSeconds: videoKind === 'long' ? 600 : 45, hashtagsBase: ['topic'], ...(videoKind === 'long' ? { scriptStructure: findFormat('chaptered-explainer')!.scriptStructure } : {}) });
      out[`${prefix}/review-${videoKind}/user`] = reviewUser({ direction, videoKind, scriptText: 'A test script.', captions: '', nicheDescription: 'A test topic', briefText: 'A supplied fact.', styleGuide: 'Plain language.', targetSeconds: videoKind === 'long' ? 600 : 45 });
    }
    out[`${prefix}/planner-short/free`] = buildShortPlanPrompt(undefined, undefined, 6, direction);
    out[`${prefix}/planner-short/fixed`] = buildShortPlanPrompt('stock-footage', 'none', 6, direction);
    out[`${prefix}/planner-long`] = buildLongPlanPrompt({ direction, visualStyle: 'Watercolour', scriptGuide: 'Plain language.' });
    out[`${prefix}/frame-short/stills`] = buildFrameReviewPrompt('ai-stills', true, undefined, direction, 'Watercolour');
    out[`${prefix}/frame-short/stock`] = buildFrameReviewPrompt('stock-footage', false, undefined, direction, 'Watercolour');
    out[`${prefix}/frame-long/stills`] = buildFrameReviewPrompt('ai-stills', true, { frameCount: 4 }, direction, 'Watercolour');
    out[`${prefix}/still-check`] = buildStillCheckSystemPrompt(direction, 'Watercolour');
  }
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

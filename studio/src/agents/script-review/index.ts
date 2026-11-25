import type { ResolvedDirection } from '../../channel-profile/resolve';
import { ScoreAuditSchema, LegacyScoreAuditSchema, scoreWithoutAdvisories, scoreFromAudit, type ScoreAudit, type LegacyScoreAudit } from './score-audit';
import { scenePropStatus } from './scene-props';
import { groundModelFindings, unsupportedSr2 } from './grounded-findings';
import { numberFormattingEquivalent } from './numbers';
import { checkBrief } from './brief-checks';
import { calibrateReview } from './rules';
import { confirmHardCaps, type HardCapCheck } from './hard-cap-confirmation';
import { z } from "zod";
import {
  callLLM,
  CallLedger,
  describeJsonError,
  extractJsonText,
  type LLMResponse,
  spendLimitBeforeRetryError,
  type RetryGuard,
} from "../../llm";
import { getStageErrorContext, TransientStageError, NonTransientStageError } from "../../run-pipeline/retry-with-backoff";
import { llmUsageContext, llmCallsContext } from "../../run-pipeline/stage-failure";
import { renderEvidenceBlock, validateEvidenceArguments, type EvidencePacket } from "../../content-evidence/packet";
import { buildReviewSystemPrompt } from '../../prompts/system-prompts';
export { SHORT_REVIEW_SYSTEM_PROMPT as SYSTEM_PROMPT, LONG_REVIEW_SYSTEM_PROMPT as LONG_FORM_SYSTEM_PROMPT, buildReviewSystemPrompt } from '../../prompts/system-prompts';

// Script Review agent — AGENT_FLEET_DESIGN.md Section 4.5. A lightweight
// rubric score + notes over Script Generation's output, including the
// video-generation-fit check (4.5's updated responsibilities). Cheap/fast
// model tier (registry.ts's 'script-review' purpose) per Section 8.1's
// classification/scoring row.
//
// Bugs Task 3 (R3) — a score below SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD no
// longer reaches Gate 1 automatically: state-machine.ts's
// runScriptReviewStage loops back into script_generation for a fresh
// attempt instead, up to MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS times (same
// attemptNumber-based cap convention as video-intelligence's own
// MAX_VIDEO_REGEN_ATTEMPTS), after which it proceeds to Gate 1 regardless of
// score so a genuinely hard brief still reaches a human. Founder's own
// decision, replacing this agent's original "no auto-revision loop" design.
export const SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD = 7;
export const MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS = 3;

export const ScriptReviewOutputSchema = z.object({
  score: z.number().min(0).max(10),
  notes: z.string().min(1),
  // Sprint 2 Task 4 (G3) — deliberately separate from the bundled `score`,
  // not folded into it: a script can score fine overall while still opening
  // weak, and the first 1-2 seconds disproportionately determine whether a
  // Short survives the first swipe (MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md
  // §2). Same "extend the existing cheap-tier call" principle Week 5 Task
  // 4's C3 (factualConcerns) already established on this same call.
  hookScore: z.number().min(0).max(10),
  hookNotes: z.string().min(1),
  videoGenFit: z.object({
    fitsLengthLimit: z.boolean(),
    pacingRealistic: z.boolean(),
    visualsProducible: z.boolean(),
    flags: z.array(z.string()),
  }),
  // Week 5 Task 4 (C3, KNOWN_ISSUES_AND_BLOCKERS.md) — a plausibility check,
  // NOT a verified fact-check: studio/src/llm/client.ts has no tool use/web
  // search wired in anywhere, so the model can only flag claims that seem
  // wrong, outdated, or unverifiable based on its own training, never
  // actually look anything up. Empty array if nothing seems off. This turns
  // an unreviewed gap into at least a flagged one the founder sees at Gate 1
  // alongside the rest of the review — a real, search-grounded fact-check
  // (a distinct purpose once studio/src/llm/ supports tool use) is deferred,
  // not built here.
  factualConcerns: z.array(z.string()),
  // Sprint 4 Task 2 (R8): same shape as factualConcerns. Defaulted so stage
  // outputs stored before this field existed still parse.
  styleGuideViolations: z.array(z.string()).default([]),
  // Sprint 4 Task 10 (R1): long-form only. One short note per chapter; absent for a Short.
  chapterNotes: z
    .array(z.object({ chapterTitle: z.string(), note: z.string() }))
    .optional(),
});
export const ScriptReviewWireSchema = ScriptReviewOutputSchema.extend({ scoreAudit: ScoreAuditSchema });
const LegacyReviewWireSchema = ScriptReviewOutputSchema.extend({ scoreAudit: LegacyScoreAuditSchema.optional() });
export type ScriptReviewOutput = z.infer<typeof ScriptReviewOutputSchema>;

export type ScriptReviewResult = {
  output: ScriptReviewOutput;
  llm: LLMResponse;
  calls?: LLMResponse[];
  // Per-finding results of the SR-1/SR-9 hard-cap confirmation; absent when no check ran. Not part of the public review.
  hardCapChecks?: HardCapCheck[];
};

// Sprint 4 Task 10 (R1): the rubric for a 2 to 15 minute chaptered video. The JSON shape is the
// Shorts one plus optional chapterNotes; the factual-concern and style-guide rules are the same
// text as the Shorts prompt, and hookScore/hookNotes judge the opening instead of the first swipe.
export type ReviewScriptParams = {
  direction?: ResolvedDirection;
  // LLM Registry task (R5): the stage's budget check, asked before every extra provider call.
  retryGuard?: RetryGuard;
  scriptText: string;
  captions: string;
  nicheDescription: string;
  styleGuide?: string | null;
  // Sprint 4 Task 2 (R4/R6/R8)
  briefText?: string;
  targetSeconds?: number;
  bannedOpeners?: string[];
  bannedEndings?: string[];
  // Sprint 4 Task 10 (R1): long-form only; absent for a Short.
  videoKind?: "short" | "long";
  chapterTitles?: string[];
  // Task 9 R2.3: the script's word count was outside +/-20% of the target after the repair attempt.
  lengthOutOfRange?: boolean;
  evidence?: EvidencePacket;
};

export function buildUserMessage(params: ReviewScriptParams): string {
  const packet = params.evidence && validateEvidenceArguments(params.evidence, params);
  if (params.videoKind === 'long' && packet && packet.factPolicy !== 'brief-only') {
    throw new NonTransientStageError('Long-form evidence must use the effective brief-only policy');
  }
  const lines = [
    `Script:\n${params.scriptText}`,
    `Captions:\n${params.captions}`,
    `Channel niche: ${params.nicheDescription}`,
  ];
  if (packet) {
    lines.push(renderEvidenceBlock(packet));
  } else if (params.briefText) {
    lines.push(`Original brief:\n${params.briefText}`);
  }
  if (params.styleGuide) {
    lines.push(`Style guide: ${params.styleGuide}`);
  }
  if (params.bannedOpeners && params.bannedOpeners.length > 0) {
    lines.push(`Banned openings: ${params.bannedOpeners.join("; ")}`);
  }
  if (params.bannedEndings && params.bannedEndings.length > 0) {
    lines.push(`Banned endings: ${params.bannedEndings.join("; ")}`);
  }
  if (params.videoKind === "long") {
    if (params.chapterTitles && params.chapterTitles.length > 0) {
      lines.push(
        `Chapters, in order: ${params.chapterTitles.map((t, i) => `${i + 1}. ${t}`).join("; ")}`,
      );
    }
    if (params.targetSeconds) {
      lines.push(
        `Target length: approximately ${params.targetSeconds} seconds (${Math.round(params.targetSeconds / 60)} minutes) when read aloud, within plus or minus 20%.`,
      );
    }
    if (params.lengthOutOfRange) {
      lines.push(
        "Generation note: the word count was outside the 20% range of the target even after one repair attempt. Set fitsLengthLimit to false and say so in flags.",
      );
    }
  } else if (params.targetSeconds) {
    lines.push(
      `Target length: approximately ${params.targetSeconds} seconds when read aloud (never more than 60).`,
    );
  }
  const brief = packet?.briefText ?? params.briefText;
  if (brief) {
    const checks = checkBrief(brief, params.scriptText);
    lines.push('Computed narration word count: ' + params.scriptText.trim().split(/\s+/).length + '. Use this count, not a guessed count.');
    lines.push('Candidate checks (not verdicts; confirm/dismiss against the same evidence):\n<hint-data>' +
      JSON.stringify(checks).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') + '</hint-data>');
  }
  return lines.join("\n\n");
}

export async function reviewScript(
  params: ReviewScriptParams,
  complete: typeof callLLM = callLLM,
  options: { legacyReplay?: true } = {},
): Promise<ScriptReviewResult> {
  if (params.evidence) validateEvidenceArguments(params.evidence, params);
  const isLong = params.videoKind === 'long';
  const calls: LLMResponse[] = [];
  // LLM Registry task (R5): the first review call, its format-retry call and callLLM's own extra calls share
  // the two-extra-calls ceiling, each checked against the stage's budget (params.retryGuard).
  const ledger = new CallLedger({ guard: params.retryGuard });
  const messages = [{ role: 'user' as const, content: buildUserMessage(params) }];
  const system = buildReviewSystemPrompt(params);
  let lastFailure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let llm: LLMResponse;
    if (attempt > 0) {
      // The format-retry call is the bad-reply repair call: it takes its place in the ceiling first.
      const taken = await ledger.take('script-review', 'bad-json');
      if (!taken.ok) {
        if (taken.why === 'budget') {
          throw spendLimitBeforeRetryError('Script Review', taken.detail, { ...llmCallsContext(calls), rawReply: calls.at(-1)!.text, stopReason: calls.at(-1)!.stopReason });
        }
        break; // the allowance is used up: fail on the first unusable reply below
      }
    }
    try {
      llm = await complete({ purpose: 'script-review', ledger, system,
        messages: attempt === 0 ? messages : [...messages, { role: 'assistant', content: calls[0].text.slice(0, 16000) },
          { role: 'user', content: 'The previous reply was incomplete or invalid JSON/schema/score audit. Return the COMPLETE schema-conforming review, including a consistent scoreAudit. A truncated or unparsable reply cannot be scored or treated as clean. Do not change the factual assessment just to fit the format.' }],
        outputSchema: ScriptReviewWireSchema });
    } catch (error) {
      if (!calls.length) throw error;
      const failedContext = getStageErrorContext(error);
      const completedCalls = llmCallsContext(calls).calls as unknown[];
      const context = { ...failedContext, calls: [...completedCalls, ...(Array.isArray(failedContext?.calls) ? failedContext.calls : [])], rawReply: calls.at(-1)!.text };
      if (error instanceof TransientStageError) throw new TransientStageError(error.message, error, context);
      throw new NonTransientStageError('Script Review retry call failed', error, context);
    }
    calls.push(llm);
    let output: ScriptReviewOutput;
    let audit: ScoreAudit | LegacyScoreAudit | undefined;
    try {
      if (llm.stopReason === 'length' || llm.stopReason === 'max_tokens') throw new Error('output token limit reached; response incomplete');
      const wire = (options.legacyReplay ? LegacyReviewWireSchema : ScriptReviewWireSchema).parse(JSON.parse(extractJsonText(llm.text)));
      audit = wire.scoreAudit;
      output = ScriptReviewOutputSchema.parse(wire);
    } catch (error) { lastFailure = error; continue; }
      const brief = params.evidence?.briefText ?? params.briefText;
      const checks = brief ? checkBrief(brief, params.scriptText) : null;
      // Only format-only findings provably contradicted by numerical equivalence are dismissed.
      const explicitSpelling = brief && /\b(spell(?:ed)?(?: out)?|as numerals|as digits|in words|exact (?:word(?:ing)?|spelling)|(?:say|write|use) (?:exactly|verbatim))\b/i.test(brief);
      const styleGuideViolations = output.styleGuideViolations.filter(text => !(
        !explicitSpelling && checks && !checks.numericViolations.some(v => v.startsWith('SR-1:')) &&
        /\b(spelled|numerals?|digits?|numeric form)\b/i.test(text) && numberFormattingEquivalent(brief!, params.scriptText, text)));
      const formatted = { ...output, styleGuideViolations };
      const grounded = brief ? groundModelFindings(formatted, brief, params.scriptText) : formatted;
      const dismissedSr2 = options.legacyReplay ? [] : grounded.styleGuideViolations.filter(unsupportedSr2);
      const corrected = { ...grounded, styleGuideViolations: grounded.styleGuideViolations.filter(f => options.legacyReplay || !unsupportedSr2(f)), notes: [grounded.notes, ...dismissedSr2.map(f => 'Reviewer correction (advisory, no new cap): SR-2 requires an absent explicit constraint. Original finding: ' + f)].join('\n') };
      const softProp = (finding: string) => Boolean(brief && scenePropStatus(brief, params.scriptText, finding) === 'soft');
      const briefOnly = isLong || params.evidence?.factPolicy === 'brief-only';
      // A hard cap (SR-1, brief-only SR-9) needs a second opinion on the quoted sentence; archived replays predate it.
      let reviewed = corrected, hardCapChecks: HardCapCheck[] | undefined;
      if (brief && !options.legacyReplay) {
        const candidates = corrected.factualConcerns.filter(f => { const rule = Number(f.match(/^\s*\[?SR-([1-9])\b/i)?.[1] ?? 1); return rule === 1 || (rule === 9 && briefOnly && !softProp(f)); });
        try { hardCapChecks = await confirmHardCaps({ findings: candidates, brief, script: params.scriptText, complete, calls, retryGuard: params.retryGuard }); }
        catch (error) {
          const failedContext = getStageErrorContext(error);
          const context = { ...failedContext, calls: [...(llmCallsContext(calls).calls as unknown[]), ...(Array.isArray(failedContext?.calls) ? failedContext.calls : [])], rawReply: calls.at(-1)!.text };
          if (error instanceof TransientStageError) throw new TransientStageError(error.message, error, context);
          throw new NonTransientStageError('Script Review hard-cap confirmation failed', error, context);
        }
        const dismissed = hardCapChecks.filter(c => c.outcome === 'dismissed').map(c => c.finding);
        if (dismissed.length) reviewed = { ...corrected, factualConcerns: corrected.factualConcerns.filter(f => !dismissed.includes(f)),
          notes: [corrected.notes, ...dismissed.map(f => 'Reviewer correction (advisory, no new cap): confirmation found the quoted sentence supported by, or a paraphrase of, the brief facts. Original finding: ' + f)].join('\n') };
      }
      let scored: ScriptReviewOutput;
      try { scored = audit ? (options.legacyReplay ? scoreWithoutAdvisories(output, reviewed, audit as LegacyScoreAudit, softProp, true) : scoreFromAudit(output, reviewed, audit as ScoreAudit)) : reviewed; } catch (error) { lastFailure = error; continue; }
      const confirmed = hardCapChecks && new Set(hardCapChecks.filter(c => c.outcome === 'confirmed').map(c => c.finding));
      const calibrated = calibrateReview(scored, [...(checks?.exactViolations ?? []), ...(checks?.numericViolations ?? [])], briefOnly, softProp, confirmed);
      return { output: calibrated, llm, ...(calls.length > 1 ? { calls } : {}), ...(hardCapChecks?.length ? { hardCapChecks } : {}) };
  }
  const last = calls.at(-1)!;
  throw new NonTransientStageError('Script Review did not return a complete valid review after one format retry (' + describeJsonError(lastFailure) + ')', lastFailure,
    { ...llmUsageContext(last), ...llmCallsContext(calls), rawReply: last.text,
      rawReviewResponses: calls.map(c => ({ text: c.text, stopReason: c.stopReason, usage: c.usage, costUsd: c.costUsd })) });
}

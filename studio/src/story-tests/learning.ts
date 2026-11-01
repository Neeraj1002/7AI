import { sentenceSpans } from '../agents/script-review/numbers';
import type { PackagingRecord } from '../packaging/record';
import { readStoredScriptCheck, readStoredStoryTests } from './view';
import type { HookShape, StoredCall, StoredScriptCheck, StoredStoryTests } from './schemas';

// Sprint 6 Task 3, Part C (R7): the learning record. Nothing here calls a model. The shapes come from plain code, the tags are
// written when each step happens, and the record is a projection of what is already stored (the intake row, the script review
// row and Task 1's packaging record), so it cannot drift from it and no title or promise is stored twice.

// Words that open a question in a feed title or a spoken line. Generic English, no channel or niche.
const QUESTION_OPENERS = new Set(['what', 'why', 'how', 'who', 'whom', 'whose', 'when', 'where', 'which', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'had']);

export type OpeningWordType = 'number' | 'question_word' | 'other' | 'none';

export type TitleShape = { wordCount: number; hasQuestionMark: boolean; hasFigure: boolean; openingWordType: OpeningWordType };

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);
const hasDigit = (text: string) => /\d/.test(text);

export function titleShape(title: string): TitleShape {
  const w = words(title.trim());
  const first = (w[0] ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  let openingWordType: OpeningWordType = 'none';
  if (first) openingWordType = /^\d/.test(first) ? 'number' : QUESTION_OPENERS.has(first) ? 'question_word' : 'other';
  return { wordCount: w.length, hasQuestionMark: title.includes('?'), hasFigure: hasDigit(title), openingWordType };
}

// The first sentence of the script a viewer hears. null for an empty script.
export function hookShape(scriptText: string): HookShape | null {
  const spans = sentenceSpans(scriptText);
  const first = spans[0];
  if (!first) return null;
  const sentence = scriptText.slice(first.start, first.end).trim();
  if (!sentence) return null;
  return { firstSentenceWordCount: words(sentence).length, kind: sentence.endsWith('?') ? 'question' : 'statement', hasFigure: hasDigit(sentence) };
}

// Pipeline-version tags (R7). Written by code at the moment the intake stage completes and never edited afterwards. A run made
// before Part C has no `pipelineTags` and reads as untagged (null), never as "off".
export type PipelineTags = {
  version: 1;
  storyTests: 'on' | 'off';
  // The stock-footage fix has no stable identifier code can read at run time (R0 item 7), so this is null on every run.
  // The build commit below is the stable handle: compare it with the fix's merge commit.
  stockFootageFix: string | null;
  build: string | null;
};

export function buildPipelineTags(params: { storyTestsOn: boolean; buildCommit: string | null }): PipelineTags {
  return { version: 1, storyTests: params.storyTestsOn ? 'on' : 'off', stockFootageFix: null, build: params.buildCommit };
}

export function readPipelineTags(intakeOutput: unknown): PipelineTags | null {
  const t = (intakeOutput as { pipelineTags?: PipelineTags } | null | undefined)?.pipelineTags;
  return t && t.version === 1 ? t : null;
}

export type LearningRecord = {
  version: 1;
  runId: string;
  channelId: string;
  tenantId: string;
  // null for a run made before the tags existed ("untagged"), never read as off.
  tags: PipelineTags | null;
  // How Part A ended for this run, for grouping: 'used' (an angle chosen), 'skipped', 'not_run', 'waiting', or null when the
  // run has no Part A record (feature off, or an old run).
  partA: 'used' | 'skipped' | 'not_run' | 'waiting' | null;
  angleStep: {
    anglesOffered: { id: string; title: string; promise: string; figureFlag: string | null }[];
    readerRuns: StoredStoryTests['angleStep']['readerRuns'];
    mark: StoredStoryTests['angleStep']['mark'];
    chosenId: string | null;
    choseReaderPick: boolean | null;
    notRunReason: string | null;
  } | null;
  scriptCheck: {
    status: StoredScriptCheck['status'];
    notRunReason: string | null;
    verdict: StoredScriptCheck['verdict'];
    reasons: StoredScriptCheck['reasons'];
    reader: StoredScriptCheck['reader'];
    promiseMatch: StoredScriptCheck['promiseMatch'];
    promiseUsed: StoredScriptCheck['promiseUsed'];
    scriptHash: string;
    hookShape: HookShape | null;
  } | null;
  // Shapes from code. The title is Task 1's chosen package title (read from its record, not stored again); null when none was chosen.
  titleShape: TitleShape | null;
  calls: StoredCall[];
  costUsd: number;
};

// 'used' only when an angle was chosen. A status the record does not name (the view's 'running') is not an outcome: null.
export function partAOutcome(stored: StoredStoryTests | null): LearningRecord['partA'] {
  switch (stored?.angleStep.status) {
    case 'chosen': return 'used';
    case 'skipped': return 'skipped';
    case 'not_run': return 'not_run';
    case 'waiting': return 'waiting';
    default: return null;
  }
}

export function buildLearningRecord(params: {
  run: { id: string; channelId: string; tenantId: string };
  intakeOutput: unknown;
  scriptReviewOutput: unknown;
  packaging: Pick<PackagingRecord, 'chosen'> | null;
}): LearningRecord {
  const stored = readStoredStoryTests(params.intakeOutput);
  const check = readStoredScriptCheck(params.scriptReviewOutput);
  const chosenTitle = params.packaging?.chosen?.title ?? null;
  return {
    version: 1,
    runId: params.run.id,
    channelId: params.run.channelId,
    tenantId: params.run.tenantId,
    tags: readPipelineTags(params.intakeOutput),
    partA: partAOutcome(stored),
    angleStep: stored
      ? {
          anglesOffered: stored.angleStep.angles.map((a) => ({ id: a.id, title: a.title, promise: a.promise, figureFlag: a.figureFlag })),
          readerRuns: stored.angleStep.readerRuns,
          mark: stored.angleStep.mark,
          chosenId: stored.angleStep.chosenId,
          choseReaderPick: stored.angleStep.choseReaderPick,
          notRunReason: stored.angleStep.notRunReason,
        }
      : null,
    scriptCheck: check
      ? {
          status: check.status, notRunReason: check.notRunReason, verdict: check.verdict, reasons: check.reasons, reader: check.reader,
          promiseMatch: check.promiseMatch, promiseUsed: check.promiseUsed, scriptHash: check.scriptHash, hookShape: check.hookShape ?? null,
        }
      : null,
    titleShape: chosenTitle ? titleShape(chosenTitle) : null,
    calls: [...(stored?.calls ?? []), ...(check?.calls ?? [])],
    costUsd: Math.round(((stored?.costUsd ?? 0) + (check?.costUsd ?? 0)) * 1e6) / 1e6,
  };
}

import { markLabel } from './pair-reader';
import { ADVISORY_NOTE, REASON_LABELS, VERDICT_LABELS, scriptHash } from './script-check';
import type { StoredScriptCheck, StoredStoryTests } from './schemas';

// Contract C3. What `runs.get` returns as `storyTests`: every label in plain words, written here, so the app never
// recomputes a mark, a pick or a reason.

export type StoryTestsView = {
  enabled: boolean;
  angleStep: {
    status: 'running' | 'waiting' | 'chosen' | 'skipped' | 'not_run';
    notRunReason: string | null;
    angles: { id: string; title: string; promise: string; figureFlag: string | null; readerTags: { kind: 'click' | 'skip'; label: string }[] }[];
    readerPicks: { run: 1 | 2; clickId: string; clickWhy: string; skipId: string; skipWhy: string }[];
    mark: 'clear_winner' | 'no_clear_winner' | 'no_clear_winner_reader_error' | null;
    markLabel: string | null;
    readerTopId: string | null;
    chosenId: string | null;
    choseReaderPick: boolean | null;
  };
  // Part B. Null until the check has run (or when the feature was off at that point).
  scriptCheck: ScriptCheckView | null;
};

export type ScriptCheckView = {
  status: 'ran' | 'not_run';
  notRunReason: string | null;
  verdict: 'pass' | 'fail' | null;
  verdictLabel: string | null;
  reasons: { code: 'cant_tell' | 'swipe_early' | 'first_sentence_no' | 'promise_mismatch'; label: string }[];
  about: string | null;
  whyCare: string | null;
  swipeLine: string | null;
  swipeAtPercent: number | null;
  remembered: string | null;
  firstSentence: { keeps: boolean; why: string } | null;
  weakestSentence: { quote: string; why: string } | null;
  promiseMatch: { ran: boolean; note: string };
  scriptChanged: boolean;
  advisoryNote: string;
};

export function readStoredScriptCheck(scriptReviewOutput: unknown): StoredScriptCheck | null {
  const s = (scriptReviewOutput as { storyTest?: StoredScriptCheck } | null | undefined)?.storyTest;
  return s && s.version === 1 && (s.status === 'ran' || s.status === 'not_run') ? s : null;
}

// Contract C3, `scriptCheck`. A check that did not run shows no answers (they would look like a result). `currentScriptText`
// is the script the founder sees now; a different hash than the one the reader read means "script changed since this check".
export function buildScriptCheckView(stored: StoredScriptCheck, currentScriptText: string | null): ScriptCheckView {
  const ran = stored.status === 'ran' && stored.reader !== null;
  const reader = ran ? stored.reader : null;
  const swipe = reader?.swipe_line.trim() ?? '';
  return {
    status: stored.status,
    notRunReason: stored.notRunReason,
    verdict: ran ? stored.verdict : null,
    verdictLabel: ran && stored.verdict ? VERDICT_LABELS[stored.verdict] : null,
    reasons: ran ? stored.reasons.map((code) => ({ code, label: REASON_LABELS[code] })) : [],
    about: reader?.about ?? null,
    whyCare: reader?.why_care ?? null,
    swipeLine: reader && stored.swipeAtPercent !== null ? swipe : null,
    swipeAtPercent: ran ? stored.swipeAtPercent : null,
    remembered: reader?.remembered ?? null,
    firstSentence: reader ? { keeps: reader.first_sentence_keeps_me.keeps === 'yes', why: reader.first_sentence_keeps_me.why } : null,
    weakestSentence: reader ? { quote: reader.weakest_sentence.quote, why: reader.weakest_sentence.why } : null,
    promiseMatch: { ran: stored.promiseMatch.ran, note: stored.promiseMatch.note },
    scriptChanged: currentScriptText !== null && scriptHash(currentScriptText) !== stored.scriptHash,
    advisoryNote: ADVISORY_NOTE,
  };
}

// Contract r8: per angle, which valid reads would click or skip it, in server wording.
function readerTagsFor(angleId: string, picks: Array<{ run: 1 | 2; clickId: string; skipId: string }>): { kind: 'click' | 'skip'; label: string }[] {
  const tags: { kind: 'click' | 'skip'; label: string }[] = [];
  for (const kind of ['click', 'skip'] as const) {
    const runs = picks.filter((p) => (kind === 'click' ? p.clickId : p.skipId) === angleId).map((p) => p.run);
    if (runs.length === 0) continue;
    const verb = kind === 'click' ? 'click' : 'skip';
    tags.push({ kind, label: `Reader would ${verb} · ${runs.length === 2 ? 'both reads' : `read ${runs[0]}`}` });
  }
  return tags;
}

export function readStoredStoryTests(intakeOutput: unknown): StoredStoryTests | null {
  const s = (intakeOutput as { storyTests?: StoredStoryTests } | null | undefined)?.storyTests;
  return s && s.version === 1 && s.angleStep && Array.isArray(s.angleStep.angles) ? s : null;
}

// The angle the founder chose, as stored: the one place the script step (Part A) and the cold-reader's promise
// check (Part B) both read it. Null when nothing was chosen (skipped, not run, still waiting, or the feature off).
export function chosenAngleOf(intakeOutput: unknown): { id: string; title: string; promise: string } | null {
  const step = readStoredStoryTests(intakeOutput)?.angleStep;
  if (!step || step.status !== 'chosen' || !step.chosenId) return null;
  const angle = step.angles.find((a) => a.id === step.chosenId);
  return angle ? { id: angle.id, title: angle.title, promise: angle.promise } : null;
}

// `intakeOutput`: the latest completed intake stage's output. `running`: the switch is on, the run is at intake and
// nothing is stored yet, so the card can say the angles are being written.
export function buildStoryTestsView(params: {
  intakeOutput: unknown;
  runStatus: string;
  runStage: string | null;
  switchOn: boolean;
  // Part B: the latest completed script review stage's output, and the script text the founder sees now.
  scriptReviewOutput?: unknown;
  currentScriptText?: string | null;
}): StoryTestsView | null {
  const stored = readStoredStoryTests(params.intakeOutput);
  if (!stored) {
    if (params.switchOn && params.runStage === 'intake' && params.runStatus === 'running') {
      return {
        enabled: true,
        angleStep: { status: 'running', notRunReason: null, angles: [], readerPicks: [], mark: null, markLabel: null, readerTopId: null, chosenId: null, choseReaderPick: null },
        scriptCheck: null,
      };
    }
    return null;
  }
  const step = stored.angleStep;
  const readerPicks = step.readerRuns
    .filter((r) => r.error === null && r.clickId && r.skipId && r.clickWhy && r.skipWhy)
    .map((r) => ({ run: r.run, clickId: r.clickId!, clickWhy: r.clickWhy!, skipId: r.skipId!, skipWhy: r.skipWhy! }));
  return {
    enabled: true,
    angleStep: {
      status: step.status,
      notRunReason: step.notRunReason,
      angles: step.angles.map((a) => ({ ...a, readerTags: readerTagsFor(a.id, readerPicks) })),
      // Only the reads that were valid (possibly none); the angles stay choosable either way.
      readerPicks,
      mark: step.mark,
      markLabel: step.mark ? markLabel(step.mark) : null,
      readerTopId: step.mark === 'clear_winner' ? step.readerTopId : null,
      chosenId: step.chosenId,
      choseReaderPick: step.choseReaderPick,
    },
    scriptCheck: (() => {
      const check = readStoredScriptCheck(params.scriptReviewOutput);
      return check ? buildScriptCheckView(check, params.currentScriptText ?? null) : null;
    })(),
  };
}

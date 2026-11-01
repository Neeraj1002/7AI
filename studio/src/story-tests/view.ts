import { markLabel } from './pair-reader';
import type { StoredStoryTests } from './schemas';

// Contract C3. What `runs.get` returns as `storyTests`: every label in plain words, written here, so the app never
// recomputes a mark, a pick or a reason.

export type StoryTestsView = {
  enabled: boolean;
  angleStep: {
    status: 'running' | 'waiting' | 'chosen' | 'skipped' | 'not_run';
    notRunReason: string | null;
    angles: { id: string; title: string; promise: string; figureFlag: string | null }[];
    readerPicks: { run: 1 | 2; clickId: string; clickWhy: string; skipId: string; skipWhy: string }[];
    mark: 'clear_winner' | 'no_clear_winner' | 'no_clear_winner_reader_error' | null;
    markLabel: string | null;
    readerTopId: string | null;
    chosenId: string | null;
    choseReaderPick: boolean | null;
  };
  // Part B (PR B) fills this. Null until the check has run or been skipped.
  scriptCheck: null;
};

export function readStoredStoryTests(intakeOutput: unknown): StoredStoryTests | null {
  const s = (intakeOutput as { storyTests?: StoredStoryTests } | null | undefined)?.storyTests;
  return s && s.version === 1 && s.angleStep && Array.isArray(s.angleStep.angles) ? s : null;
}

// `intakeOutput`: the latest completed intake stage's output. `running`: the switch is on, the run is at intake and
// nothing is stored yet, so the card can say the angles are being written.
export function buildStoryTestsView(params: { intakeOutput: unknown; runStatus: string; runStage: string | null; switchOn: boolean }): StoryTestsView | null {
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
      angles: step.angles,
      readerPicks: readerPicks.length === 2 ? readerPicks : [],
      mark: step.mark,
      markLabel: step.mark ? markLabel(step.mark) : null,
      readerTopId: step.mark === 'clear_winner' ? step.readerTopId : null,
      chosenId: step.chosenId,
      choseReaderPick: step.choseReaderPick,
    },
    scriptCheck: null,
  };
}

// Hand-written from the Task 3/4 contract; replace with the router types when the backend merges.
// Sprint 6 Task 3 (NEXT 5, FE): the pure logic behind the angle card and the script check card, kept free of React so it can be tested.
// The server writes every word, tag, mark and verdict (Task 3 contract C3); this file only shows, hides and places them.
// The types are hand-written from the contract because the AppRouter on main does not carry `storyTests` or `runs.chooseAngle`
// yet. When the Task 3 backend merges, replace them with the inferred router types in the same commit as the flag flip.
import type { StatusChipKind } from '../components/StatusChip';
import { flags } from './feature-flags';

export type ReaderTag = { kind: 'click' | 'skip'; label: string };
export type Angle = { id: string; title: string; promise: string; figureFlag: string | null; readerTags: ReaderTag[] };
export type ReaderPick = { run: 1 | 2; clickId: string; clickWhy: string; skipId: string; skipWhy: string };
export type AngleMark = 'clear_winner' | 'no_clear_winner' | 'no_clear_winner_reader_error';
export type AngleStep = {
  status: 'running' | 'waiting' | 'chosen' | 'skipped' | 'not_run';
  notRunReason: string | null;
  angles: Angle[];
  readerPicks: ReaderPick[];
  mark: AngleMark | null;
  markLabel: string | null;
  readerTopId: string | null;
  chosenId: string | null;
  choseReaderPick: boolean | null;
};
export type ScriptCheck = {
  status: 'ran' | 'not_run';
  notRunReason: string | null;
  verdict: 'pass' | 'fail' | null;
  verdictLabel: string | null;
  reasons: { code: string; label: string }[];
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
export type StoryTests = { enabled: boolean; angleStep: AngleStep; scriptCheck: ScriptCheck | null };

/** `runs.get.storyTests` when the flag is on and the server sent data; null otherwise (old run, feature off, flag off). */
export function storyTestsOf(data: unknown, flagOn: boolean = flags.storyTestsCards): StoryTests | null {
  if (!flagOn) return null;
  const st = (data as { storyTests?: StoryTests | null } | null | undefined)?.storyTests;
  return st && st.enabled ? st : null;
}

/** True only for a run waiting on the angle choice, and only with the flag on (so a flag-off app shows nothing new). */
export const isAngleWait = (status: string, flagOn: boolean = flags.storyTestsCards): boolean => flagOn && status === 'paused_angle';

export const ANGLE_STATUS_WORDING = 'Waiting for your angle choice';

// ---- which angle card ------------------------------------------------------------------------------------------------

export type AngleCardKind = 'none' | 'making' | 'choose' | 'done' | 'not_run';

export function angleCardKind(st: StoryTests | null, runStatus: string): AngleCardKind {
  if (!st) return 'none';
  switch (st.angleStep.status) {
    case 'running':
      return 'making';
    case 'waiting':
      return runStatus === 'paused_angle' ? 'choose' : 'none';
    case 'chosen':
    case 'skipped':
      return 'done';
    case 'not_run':
      return 'not_run';
    default:
      return 'none';
  }
}

// ---- select, clear, confirm ------------------------------------------------------------------------------------------

export type AngleChoice = { kind: 'none' } | { kind: 'angle'; id: string } | { kind: 'skip' };
export const NO_CHOICE: AngleChoice = { kind: 'none' };

/** Tapping an angle selects it; tapping it again clears it. Selecting an angle replaces a skip. */
export function toggleAngle(c: AngleChoice, id: string): AngleChoice {
  return c.kind === 'angle' && c.id === id ? NO_CHOICE : { kind: 'angle', id };
}
/** Decision 7: "Write from the brief instead" selects the skip and clears any angle; tapping it again clears it. */
export function toggleSkip(c: AngleChoice): AngleChoice {
  return c.kind === 'skip' ? NO_CHOICE : { kind: 'skip' };
}
/** The one argument of runs.chooseAngle: an angle id, null for the skip, undefined while nothing is chosen. */
export function confirmAngleId(c: AngleChoice): string | null | undefined {
  return c.kind === 'angle' ? c.id : c.kind === 'skip' ? null : undefined;
}

export function chooseBar(c: AngleChoice, angles: Angle[]): { hint: string; button: string; enabled: boolean } {
  if (c.kind === 'angle') {
    const title = angles.find((a) => a.id === c.id)?.title ?? '';
    return { hint: `Chosen: ${title}`, button: 'Write the script from this angle', enabled: true };
  }
  if (c.kind === 'skip') return { hint: 'Chosen: write from the brief, no angle.', button: 'Write the script from the brief', enabled: true };
  return { hint: 'Choose an angle, or write from the brief.', button: 'Choose an angle first', enabled: false };
}

/** Bar text while the angles are being made (the board shows the line and no button). */
export const MAKING_BAR = 'Angles are being made.';
export const WAITING_SUBTITLE = "Getting the angles ready";
export const READER_SECTION_TITLE = 'What a first-time reader did';
export const READER_INTRO = "A first-time reader saw only these titles and promises and tried twice. It's advice: you can choose any angle.";

/** The app's own words when the choice could not be sent (never the server's reason). */
export const CHOOSE_ERROR = "Couldn't send your choice. It is still selected: try again.";

// ---- reader ----------------------------------------------------------------------------------------------------------

export const readerHeading = (run: 1 | 2): string => (run === 1 ? 'First try' : 'Second try');

export function markChipKind(mark: AngleMark | null): StatusChipKind {
  return mark === 'clear_winner' ? 'ok' : mark === 'no_clear_winner_reader_error' ? 'attention' : 'neutral';
}

export const angleTitle = (angles: Angle[], id: string): string => angles.find((a) => a.id === id)?.title ?? '';

// ---- the summary after the choice ------------------------------------------------------------------------------------

export function doneStatusPill(step: AngleStep): { label: string; kind: StatusChipKind } {
  if (step.status === 'chosen') return { label: 'Chosen', kind: 'ok' };
  if (step.status === 'skipped') return { label: 'Skipped', kind: 'neutral' };
  return { label: 'Not run', kind: 'neutral' };
}

/** The server's choseReaderPick, said in words. A different choice is stated, never flagged; null (no pick) says nothing. */
export function matchLine(choseReaderPick: boolean | null, readerTopTitle: string = ''): string | null {
  if (choseReaderPick === true) return "Matches the reader's pick.";
  if (choseReaderPick === false) return readerTopTitle ? `The reader would have clicked \u201C${readerTopTitle}\u201D. You chose another angle.` : "You chose a different angle from the reader's pick.";
  return null;
}

export const SKIPPED_LINE = 'You skipped the angles. The script is being written from your brief as it is.';
export const DONE_FOOTER = "The script is checked against the chosen angle's promise, but only as advice at Gate 1.";

export function notRunAngleLine(reason: string | null): string {
  return reason ? `Angles were not made: ${reason}. The script was written from the brief.` : 'Angles were not made. The script was written from the brief.';
}

// ---- script check ----------------------------------------------------------------------------------------------------

export type CheckKind = 'none' | 'ran' | 'not_run';
export const checkKind = (st: StoryTests | null): CheckKind => (!st?.scriptCheck ? 'none' : st.scriptCheck.status === 'ran' ? 'ran' : 'not_run');

export const verdictChipKind = (v: ScriptCheck['verdict']): StatusChipKind => (v === 'pass' ? 'ok' : 'attention');

export const FAIL_INTRO = 'A reader who saw only the script would likely lose interest. You can still approve, edit or reject as usual.';

/** Dot position for the swipe strip (0 to 100, placement only). Null hides the strip when either value is missing. */
export function swipeStrip(check: Pick<ScriptCheck, 'swipeLine' | 'swipeAtPercent'>): { percent: number } | null {
  if (check.swipeLine === null || check.swipeAtPercent === null) return null;
  return { percent: Math.min(100, Math.max(0, check.swipeAtPercent)) };
}

export const NO_SWIPE_LINE = 'The reader found no point where it would swipe away.';
export const NOT_CHECKED_LEAD = "This script wasn't checked. That is not a pass.";
export const notCheckedWhy = (reason: string | null): string | null => (reason ? `Why: ${reason}` : null);
export const SCRIPT_CHANGED_BANNER = 'Script changed since this check. What follows was for the earlier version.';

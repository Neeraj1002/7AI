// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import {
  angleCardKind,
  chooseBar,
  confirmAngleId,
  isAngleWait,
  matchLine,
  NO_CHOICE,
  notCheckedWhy,
  notRunAngleLine,
  readerHeading,
  storyTestsOf,
  swipeStrip,
  toggleAngle,
  toggleSkip,
  verdictChipKind,
  type Angle,
  type StoryTests,
} from './story-tests';
import { runChip } from './run-view';
import { queueChip, statusChipKind, statusLabel } from './run-labels';
import { buildInboxCards, reviewLabel } from './inbox';

const angles: Angle[] = [
  { id: 'a1', title: 'One', promise: 'p1', figureFlag: null, readerTags: [] },
  { id: 'a2', title: 'Two', promise: 'p2', figureFlag: "isn't in your brief", readerTags: [{ kind: 'click', label: 'Reader would click · first try' }] },
];
const st = (status: StoryTests['angleStep']['status']): StoryTests => ({
  enabled: true,
  angleStep: { status, notRunReason: null, angles, readerPicks: [], mark: null, markLabel: null, readerTopId: null, chosenId: null, choseReaderPick: null },
  scriptCheck: null,
});

describe('select, clear, confirm', () => {
  it('selects, changes and clears an angle with no other effect', () => {
    let c = toggleAngle(NO_CHOICE, 'a1');
    expect(c).toEqual({ kind: 'angle', id: 'a1' });
    c = toggleAngle(c, 'a2');
    expect(c).toEqual({ kind: 'angle', id: 'a2' });
    expect(toggleAngle(c, 'a2')).toEqual(NO_CHOICE);
  });
  it('skip is select-then-confirm and clears any angle (decision 7)', () => {
    const c = toggleSkip(toggleAngle(NO_CHOICE, 'a1'));
    expect(c).toEqual({ kind: 'skip' });
    expect(toggleAngle(c, 'a1')).toEqual({ kind: 'angle', id: 'a1' });
    expect(toggleSkip(c)).toEqual(NO_CHOICE);
  });
  it('confirm sends the angle id, null for the skip, and nothing while nothing is chosen', () => {
    expect(confirmAngleId({ kind: 'angle', id: 'a2' })).toBe('a2');
    expect(confirmAngleId({ kind: 'skip' })).toBeNull();
    expect(confirmAngleId(NO_CHOICE)).toBeUndefined();
  });
  it('the bar words follow the choice', () => {
    expect(chooseBar(NO_CHOICE, angles)).toEqual({ hint: 'Choose an angle, or write from the brief.', button: 'Choose an angle first', enabled: false });
    expect(chooseBar({ kind: 'angle', id: 'a2' }, angles)).toEqual({ hint: 'Chosen: Two', button: 'Write the script from this angle', enabled: true });
    expect(chooseBar({ kind: 'skip' }, angles).button).toBe('Write the script from the brief');
  });
});

describe('which card, and the flag', () => {
  it('maps each angle status', () => {
    expect(angleCardKind(st('running'), 'running')).toBe('making');
    expect(angleCardKind(st('waiting'), 'paused_angle')).toBe('choose');
    expect(angleCardKind(st('chosen'), 'running')).toBe('done');
    expect(angleCardKind(st('skipped'), 'running')).toBe('done');
    expect(angleCardKind(st('not_run'), 'running')).toBe('not_run');
    expect(angleCardKind(null, 'paused_angle')).toBe('none');
  });
  it('shows nothing with the flag off, or with data that is off or missing', () => {
    expect(storyTestsOf({ storyTests: st('waiting') }, false)).toBeNull();
    expect(storyTestsOf({ storyTests: { ...st('waiting'), enabled: false } }, true)).toBeNull();
    expect(storyTestsOf({ storyTests: null }, true)).toBeNull();
    expect(storyTestsOf({}, true)).toBeNull();
    expect(isAngleWait('paused_angle', false)).toBe(false);
    expect(isAngleWait('paused_angle', true)).toBe(true);
  });
});

describe('words the app owns', () => {
  it('maps the reader run to its heading', () => {
    expect(readerHeading(1)).toBe('First try');
    expect(readerHeading(2)).toBe('Second try');
  });
  it('states a match or a difference and says nothing without a pick', () => {
    expect(matchLine(true)).toBe("Matches the reader's pick.");
    expect(matchLine(false)).toContain('different');
    expect(matchLine(null)).toBeNull();
  });
  it('drops the reason clause when the reason is null', () => {
    expect(notRunAngleLine('the budget was reached')).toBe('Angles were not made: the budget was reached. The script was written from the brief.');
    expect(notRunAngleLine(null)).toBe('Angles were not made. The script was written from the brief.');
    expect(notCheckedWhy(null)).toBeNull();
    expect(notCheckedWhy('x')).toBe('Why: x');
  });
  it('a fail is amber, a pass is green, never red', () => {
    expect(verdictChipKind('pass')).toBe('ok');
    expect(verdictChipKind('fail')).toBe('attention');
  });
});

describe('swipe strip', () => {
  it('hides when either value is null and places the dot otherwise', () => {
    expect(swipeStrip({ swipeLine: null, swipeAtPercent: 6 })).toBeNull();
    expect(swipeStrip({ swipeLine: 'x', swipeAtPercent: null })).toBeNull();
    expect(swipeStrip({ swipeLine: 'x', swipeAtPercent: 6 })).toEqual({ percent: 6 });
  });
});

// The flag defaults to false, so the wording shows nowhere by default.
describe('status wording with the flag off', () => {
  it('paused_angle gets no new wording', () => {
    expect(statusLabel('paused_angle')).toBe('paused_angle');
    expect(runChip({ status: 'paused_angle' }, null).label).toBe('In progress');
    expect(queueChip('paused_angle')).toBe('paused_angle');
    expect(statusChipKind('paused_angle')).toBe('neutral');
    expect(reviewLabel(null)).toBe('Open run');
    expect(reviewLabel('angle')).toBe('Choose an angle');
    const cards = buildInboxCards([], [{ id: 'r', channelId: 'c', status: 'paused_angle', currentStage: 'intake', lastError: null, briefText: 'b', completedAt: null }]);
    expect(cards.needsYou).toHaveLength(0);
  });
});

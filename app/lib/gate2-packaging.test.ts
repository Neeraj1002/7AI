// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import {
  answeredChip,
  approveNeedsAsk,
  canChoose,
  counterText,
  gate2Screen,
  highlightSegments,
  makingCopy,
  noPackageCopy,
  packagingCostLine,
  packagingPollMs,
  packagingQueryWanted,
  quietLinkLabel,
  saveState,
  statusLine,
  thumbnailCard,
  whyThisWorks,
  type Gate2Package,
} from './gate2-packaging';
import { GATE2_FIXTURES, THUMBNAIL_FIXTURES, TITLE_CHECK_FIXTURES } from './gate2-fixtures';

const F = GATE2_FIXTURES;
const view = (k: string) => F[k].view!;

test('every fixture maps to the screen it stands for', () => {
  const expected: Record<string, string> = {
    'making': 'making', 'making-round-2': 'making', 'ready-3': 'cards', 'ready-1': 'cards', 'ready-chosen': 'cards', 'ready-title-edited': 'cards',
    'ready-youtube': 'cards', 'round-two': 'cards', 'short': 'short', 'weak-gap': 'no_package', 'none-passed': 'no_package',
    'skipped': 'no_package', 'failed': 'no_package', 'pending': 'pending',
  };
  for (const k of Object.keys(F)) assert.equal(gate2Screen(F[k]), expected[k], k);
  assert.equal(gate2Screen(undefined), 'none');
  assert.equal(gate2Screen({ pending: false, view: null }), 'none');
});

test('choosing is only offered when there are packages to choose from, never while making or with none', () => {
  assert.equal(canChoose(F['ready-3']), true);
  for (const k of ['short', 'making', 'pending', 'weak-gap', 'none-passed', 'skipped', 'failed']) assert.equal(canChoose(F[k]), false, k);
});

test('Approve with nothing chosen asks first; a choice, or no packages, does not', () => {
  assert.equal(approveNeedsAsk(F['ready-3']), true);
  assert.equal(approveNeedsAsk(F['short']), false);
  assert.equal(approveNeedsAsk(F['ready-chosen']), false);
  assert.equal(approveNeedsAsk(F['ready-youtube']), false);
  assert.equal(approveNeedsAsk(F['none-passed']), false);
  assert.equal(approveNeedsAsk(F['pending']), false);
  assert.equal(approveNeedsAsk(undefined), false);
});

test('the packaging query runs while Gate 2 is open and after publishing; it polls only while the server says making or pending', () => {
  assert.equal(packagingQueryWanted({ status: 'paused_gate2' }), true);
  assert.equal(packagingQueryWanted({ status: 'completed' }), true);
  assert.equal(packagingQueryWanted({ status: 'running' }), false);
  assert.equal(packagingPollMs(F['making']), 4_000);
  assert.equal(packagingPollMs(F['pending']), 4_000);
  assert.equal(packagingPollMs(F['ready-3']), false);
  assert.equal(packagingPollMs(undefined), false);
});

test('the "answered at" chip uses the parts, and falls back to the string', () => {
  assert.equal(answeredChip(view('ready-3').packages[0]), 'Chapter 3 / 4:20');
  assert.equal(answeredChip(view('short').packages[0]), '0:18 in the video');
  assert.equal(answeredChip(view('ready-3').packages[2]), 'Chapter 1');
  const noParts = { ...view('ready-3').packages[0], answeredAtParts: undefined } as Gate2Package;
  assert.equal(answeredChip(noParts), 'Chapter 3, about 4:20');
});

test('"why this works" is the server\'s check text, never the app\'s', () => {
  assert.equal(whyThisWorks(view('ready-3').packages[0]), 'a familiar claim a stranger half-believes.');
  assert.equal(whyThisWorks(view('ready-3').packages[1]), 'names a gap in what they know.');
  assert.equal(whyThisWorks({ ...view('ready-3').packages[0], coldReader: null, answerQuote: 'It is not free' }), 'The video says: "It is not free"');
  assert.equal(whyThisWorks({ ...view('ready-3').packages[0], coldReader: null }), null);
});

test('the status line follows the choice', () => {
  assert.equal(statusLine(view('ready-3')).tone, 'pending');
  assert.equal(statusLine(view('ready-chosen')).text, 'Using package 1: Why the 401(k) match isn’t really free');
  assert.match(statusLine(view('ready-title-edited')).text, /^Using package 1 \(title edited\): Why the 401\(k\) match isn’t free, and/);
  assert.equal(statusLine(view('ready-youtube')).text, 'Using YouTube’s suggested thumbnail. Title from the script.');
  assert.equal(quietLinkLabel, 'Keep YouTube’s suggested thumbnail');
});

test('the title counter shows the server limit; the figures problem highlights the server\'s own text', () => {
  assert.equal(counterText(38, 70), '38 / 70');
  assert.equal(counterText(10, 100), '10 / 100');
  const c = TITLE_CHECK_FIXTURES['unsupported-figure'];
  assert.deepEqual(highlightSegments(c.title, c.check.problems), [
    { text: 'Why a 401(k) match adds ', highlight: false },
    { text: '$48,000', highlight: true },
    { text: ' over a career', highlight: false },
  ]);
  assert.deepEqual(highlightSegments('Plain title', []), [{ text: 'Plain title', highlight: false }]);
  assert.deepEqual(highlightSegments('', c.check.problems), [{ text: '', highlight: false }]);
  const two = [{ kind: 'other' as const, text: 'ab', message: 'm', supportedFigures: [] }, { kind: 'other' as const, text: 'bc', message: 'm', supportedFigures: [] }];
  assert.deepEqual(highlightSegments('xabcx', two), [{ text: 'x', highlight: false }, { text: 'abc', highlight: true }, { text: 'x', highlight: false }]);
});

test('Save waits for the server: blocked until ok, and only for the text that was checked', () => {
  const ok = TITLE_CHECK_FIXTURES['clean'];
  const bad = TITLE_CHECK_FIXTURES['unsupported-figure'];
  assert.equal(saveState(null, null, 'x'), 'checking');
  assert.equal(saveState(ok.check, ok.title, ok.title), 'ready');
  assert.equal(saveState(bad.check, bad.title, bad.title), 'blocked');
  assert.equal(saveState(ok.check, ok.title, ok.title + ' more'), 'checking');
});

test('the no-package screen says why, in each of the four cases', () => {
  const weak = noPackageCopy(view('weak-gap'));
  assert.equal(weak.head, 'This script doesn’t raise a strong question');
  assert.deepEqual(weak.reasons, ['The script explains how something works, but never raises a question a stranger would wonder about.']);
  const none = noPackageCopy(view('none-passed'));
  assert.equal(none.head, 'Nothing passed our checks');
  assert.deepEqual(none.reasons, [
    'We tried twice: the first set and one automatic second round. Nothing passed.',
    'Package 1: the title used a figure the script doesn’t support.',
    'Package 2: the picture showed something the video doesn’t contain.',
  ]);
  assert.equal(noPackageCopy({ ...view('none-passed'), secondRound: { state: 'not_needed', reason: null } }).reasons[0], 'Package 1: the title used a figure the script doesn’t support.');
  assert.deepEqual(noPackageCopy(view('skipped')).reasons, ['The spend limit for this video was reached first.', 'Your video itself is not affected.']);
  assert.equal(noPackageCopy(view('failed')).head, 'We couldn’t make packages');
});

test('making: second round is said plainly; the packaging cost line carries the round', () => {
  assert.equal(makingCopy(2).title, 'Making a second set…');
  assert.equal(makingCopy(1).title, 'Making your packages…');
  assert.equal(makingCopy(undefined).title, 'Making your packages…');
  assert.equal(packagingCostLine(0.02, 1), 'Packaging so far $0.02');
  assert.equal(packagingCostLine(0.07, 2), 'Packaging so far $0.07, including the second round');
  assert.equal(packagingCostLine(undefined, 1), null);
});

test('after publishing: a custom thumbnail is shown live only when the status is live', () => {
  const T = THUMBNAIL_FIXTURES;
  assert.deepEqual(thumbnailCard(T['live']), { kind: 'live', tag: 'Live on YouTube', downloadable: false });
  assert.deepEqual(thumbnailCard(T['not-applied']), { kind: 'not_applied', tag: 'Not on YouTube', reasonText: T['not-applied'].reasonText, downloadable: true });
  assert.deepEqual(thumbnailCard(T['pending']), { kind: 'pending', tag: 'Applying', downloadable: false });
  assert.deepEqual(thumbnailCard(T['not-set']), { kind: 'youtube_chose', line: 'YouTube chose the thumbnail' });
  assert.deepEqual(thumbnailCard(T['frame-grab']), { kind: 'frame_grab' });
  assert.equal(thumbnailCard(null), null);
  // a package that is pending or not applied never reads as live
  for (const status of ['pending', 'not_applied'] as const) assert.notEqual(thumbnailCard({ ...T['live'], status })?.kind, 'live');
});

// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import {
  answeredLine,
  askedLine,
  choiceSummary,
  coldReaderLine,
  deviceLabel,
  downloadLink,
  durationChip,
  pictureLink,
  headToHeadLine,
  publishedThumbnailStatus,
  secondRoundNote,
  strangerLines,
  titleCounter,
  type PackageView,
  type PackagingView,
} from './packaging';

const pkg = (over: Partial<PackageView> = {}): PackageView =>
  ({
    id: 'c1', device: 'stake', supportingDevice: null, title: 'Why was it nearly torn down?', question: 'Why was the tower nearly torn down?',
    answeredAt: 'Chapter 3, Why Almost Destroyed, about 0:41', lettering: { words: 'SOLD FOR SCRAP?', subline: null, typeface: 'Anton' },
    readableAtSidebar: true, coldReader: { curiosity: 4, wouldClick: 'yes', guessedAbout: 'a tower.' },
    stranger: null, headToHead: null, answerQuote: null, warnings: [], round: 1,
    imageUrls: { full: '/runs/r/thumbnail/c1/full?t=abc', feed: '/runs/r/thumbnail/c1/feed?t=abc', sidebar: '/runs/r/thumbnail/c1/sidebar?t=abc' }, ...over,
  }) as PackageView;
const view = (over: Partial<PackagingView> = {}): PackagingView =>
  ({ status: 'ready', reason: null, brief: null, packages: [pkg()], dropped: [], choice: null, titleLimit: 70, videoSeconds: 125, openingNote: null, secondRound: { state: 'not_needed', reason: null }, ...over }) as PackagingView;

test('the duration chip is drawn by the card from the video length, never baked into the file', () => {
  assert.equal(durationChip(125), '2:05');
  assert.equal(durationChip(null), null);
  assert.equal(durationChip(0), null);
});

test('the card lines: what viewers will ask and where the video answers', () => {
  assert.equal(askedLine('  Why was   it torn down? '), 'Viewers will ask: Why was it torn down?');
  assert.equal(answeredLine('Chapter 3, about 0:41'), 'Answered at: Chapter 3, about 0:41');
  assert.equal(coldReaderLine(pkg()), 'A stranger guessed "a tower" and would click (curiosity 4/5).');
  assert.equal(coldReaderLine(pkg({ coldReader: null })), null);
  assert.equal(deviceLabel('how'), 'How');
});

test('a signed link needs no session header; the plain path does; downloads add a flag', () => {
  assert.deepEqual(pictureLink('/runs/r/thumbnail/c1/feed?t=abc', 'https://api.example.com/'), { url: 'https://api.example.com/runs/r/thumbnail/c1/feed?t=abc', sendAuth: false });
  assert.deepEqual(pictureLink('/runs/r/thumbnail/c1/feed', 'https://api.example.com'), { url: 'https://api.example.com/runs/r/thumbnail/c1/feed', sendAuth: true });
  assert.equal(pictureLink('/runs/r/x', null), null);
  assert.equal(downloadLink('/runs/r/thumbnail/c1/full?t=abc', 'https://api.example.com'), 'https://api.example.com/runs/r/thumbnail/c1/full?t=abc&download=1');
  assert.equal(downloadLink('/runs/r/thumbnail/c1/full', 'https://api.example.com'), 'https://api.example.com/runs/r/thumbnail/c1/full?download=1');
});

test('the title counter flags a title over the channel limit', () => {
  assert.deepEqual(titleCounter('  Short title ', 70), { text: '11/70', over: false });
  assert.equal(titleCounter('x'.repeat(71), 70).over, true);
});

test('the choice is said in words, and keeping YouTube\'s is a choice', () => {
  assert.equal(choiceSummary(view()), null);
  assert.equal(choiceSummary(view({ choice: { packageId: 'c1', title: 'My own title', titleEdited: true } })), 'Chosen: "My own title" (title edited).');
  assert.equal(choiceSummary(view({ choice: { packageId: 'youtube-suggested', title: null, titleEdited: false } })), "You chose YouTube's suggested thumbnail.");
});

test('after publishing: a custom thumbnail is claimed live only when the server says it went up', () => {
  const live = publishedThumbnailStatus({ coverFrameSet: true, thumbnail: { source: 'package', packageId: 'c1', file: 'c1-full.jpg' } });
  assert.equal(live?.kind, 'ok');
  assert.equal(live?.canDownload, true);
  const refused = publishedThumbnailStatus({
    coverFrameSet: false,
    coverFrameMessage: 'YouTube refused the cover image (403).',
    thumbnail: { source: 'package', packageId: 'c1', file: 'c1-full.jpg' },
  });
  assert.equal(refused?.kind, 'attention');
  assert.match(refused!.detail!, /403/);
  assert.match(refused!.detail!, /suggested thumbnail/);
  assert.equal(refused?.canDownload, true);
  const kept = publishedThumbnailStatus({ coverFrameSet: false, coverFrameMessage: "You kept YouTube's suggested thumbnail.", thumbnail: { source: 'youtube-suggested' } });
  assert.equal(kept?.kind, 'neutral');
  assert.equal(kept?.canDownload, false);
  assert.equal(publishedThumbnailStatus({ coverFrameSet: false, thumbnail: { source: 'frame-grab' } }), null);
  assert.equal(publishedThumbnailStatus(undefined), null);
});

test('what a stranger said is shown as advisory lines, and an empty answer is left out', () => {
  assert.deepEqual(strangerLines(pkg()), []);
  const lines = strangerLines(
    pkg({ stranger: { about: 'a tower', expectsToSee: 'the tower being built', wantsToKnow: 'why it was spared', wouldClick: 'maybe', wouldDisappoint: '' } }),
  );
  assert.deepEqual(lines, ['Might click', 'Expects to see: the tower being built', 'Wants to know: why it was spared']);
});

test('head to head: a plain count, with ties said, and nothing when there was nothing to compare', () => {
  assert.equal(headToHeadLine(pkg()), null);
  assert.equal(headToHeadLine(pkg({ headToHead: { wins: 0, losses: 0, ties: 0 } })), null);
  assert.equal(headToHeadLine(pkg({ headToHead: { wins: 2, losses: 0, ties: 0 } })), 'Won 2 of 2 head-to-head comparisons.');
  assert.equal(headToHeadLine(pkg({ headToHead: { wins: 1, losses: 0, ties: 1 } })), 'Won 1 of 2 head-to-head comparisons (1 tied).');
});

test('the second round is said plainly: when it made the options, when nothing passed even then, and when it was not made', () => {
  assert.equal(secondRoundNote(view()), null);
  assert.match(secondRoundNote(view({ secondRound: { state: 'finished', reason: null } }))!, /second round was made/);
  assert.match(secondRoundNote(view({ status: 'none_passed', packages: [], secondRound: { state: 'finished', reason: null } }))!, /Nothing passed, even after a second try/);
  assert.match(secondRoundNote(view({ status: 'none_passed', packages: [], secondRound: { state: 'skipped', reason: "the run's spend limit leaves no room" } }))!, /second try was not made: the run's spend limit/);
  assert.equal(secondRoundNote(view({ status: 'weak_gap', packages: [] })), null);
});

import type { Gate2Package, Gate2Response, Gate2View, ThumbnailResult, TitleCheck } from './gate2-packaging';

// Sprint 6 Task 1 (Gate 2 package screens): one fixture per state, typed from the contract, so every screen can be seen
// without a run (the dev-only screen `dev-gate2`) and tested. Picture links are empty placeholders: the cards draw a blank box.

const pkg = (over: Partial<Gate2Package> & Pick<Gate2Package, 'id' | 'title' | 'question'>): Gate2Package => ({
  device: 'stake',
  answeredAt: 'Chapter 3, about 4:20',
  answeredAtParts: { chapter: 3, chapterTitle: 'The catch', startSec: 260 },
  round: 1,
  hookLine: null,
  firstFrameUrl: null,
  imageUrls: { full: '', feed: '', sidebar: '' },
  coldReader: { curiosity: 4, wouldClick: 'yes', guessedAbout: 'a familiar claim a stranger half-believes.' },
  stranger: null,
  headToHead: null,
  answerQuote: null,
  warnings: [],
  ...over,
});

const P1 = pkg({ id: 'p1', title: 'Why the 401(k) match isn’t really free', question: 'Is the match really free, or is there a catch?' });
const P2 = pkg({
  id: 'p2',
  device: 'mystery',
  title: 'The 401(k) rule nobody explains at work',
  question: 'What is the rule, and does it apply to me?',
  answeredAt: 'Chapter 2, about 2:35',
  answeredAtParts: { chapter: 2, chapterTitle: 'The rule', startSec: 155 },
  coldReader: null,
  stranger: { wouldClick: 'maybe', expectsToSee: 'names a gap in what they know.', wantsToKnow: 'whether it applies', wouldDisappoint: '' },
});
const P3 = pkg({ id: 'p3', device: 'how', title: 'How a 401(k) match really works', question: 'How does the match work?', answeredAt: 'Chapter 1', answeredAtParts: { chapter: 1, chapterTitle: 'Basics', startSec: null } });
const SHORT_PKG = pkg({
  id: 's1',
  title: 'Why the 401(k) match isn’t really free',
  question: 'Is the match really free?',
  answeredAt: '0:18 in the video',
  answeredAtParts: { chapter: null, chapterTitle: null, startSec: 18 },
  hookLine: 'Your boss says the match is free. It isn’t.',
  firstFrameUrl: '',
  imageUrls: null,
});

const view = (over: Partial<Gate2View> = {}): Gate2View => ({
  status: 'ready',
  reason: null,
  brief: { question: 'Is the match really free?' },
  packages: [P1, P2],
  dropped: [],
  choice: null,
  titleLimit: 70,
  videoSeconds: 402,
  packagingCostUsd: 0.04,
  round: 1,
  ...over,
});

const resp = (v: Gate2View | null, over: Partial<Gate2Response> = {}): Gate2Response => ({ pending: false, making: false, view: v, ...over });

export const GATE2_FIXTURES: Record<string, Gate2Response> = {
  'making': resp(view({ packages: [], packagingCostUsd: 0.02 }), { making: true }),
  'making-round-2': resp(view({ packages: [], round: 2, packagingCostUsd: 0.07 }), { making: true }),
  'ready-3': resp(view({ packages: [P1, P2, P3] })),
  'ready-1': resp(view({ packages: [P1] })),
  'ready-chosen': resp(view({ choice: { packageId: 'p1', title: P1.title, titleEdited: false } })),
  'ready-title-edited': resp(view({ choice: { packageId: 'p1', title: 'Why the 401(k) match isn’t free, and what it costs you', titleEdited: true } })),
  'ready-youtube': resp(view({ choice: { packageId: 'youtube-suggested', title: null, titleEdited: false } })),
  'round-two': resp(view({ round: 2, packages: [{ ...P1, round: 2 }, { ...P2, round: 2 }] })),
  'short': resp(view({ packages: [SHORT_PKG], videoSeconds: 41 })),
  'short-chosen': resp(view({ packages: [SHORT_PKG], videoSeconds: 41, choice: { packageId: 'youtube-suggested', title: null, titleEdited: false } })),
  'weak-gap': resp(view({ status: 'weak_gap', packages: [], reason: 'The script explains how something works, but never raises a question a stranger would wonder about.' })),
  'none-passed': resp(
    view({
      status: 'none_passed',
      packages: [],
      round: 2,
      dropped: [
        { title: P1.title, device: 'stake', reasons: ['the title used a figure the script doesn’t support.'] },
        { title: P2.title, device: 'mystery', reasons: ['the picture showed something the video doesn’t contain.'] },
      ],
    }),
  ),
  'skipped': resp(view({ status: 'skipped', packages: [], reason: 'The spend limit for this video was reached first.' })),
  'failed': resp(view({ status: 'failed', packages: [], reason: 'The picture step didn’t finish.' })),
  'pending': resp(null, { pending: true }),
};

export const TITLE_CHECK_FIXTURES: Record<string, { title: string; check: TitleCheck }> = {
  'clean': { title: 'Why the 401(k) match isn’t really free', check: { ok: true, length: 38, titleLimit: 70, problems: [] } },
  'unsupported-figure': {
    title: 'Why a 401(k) match adds $48,000 over a career',
    check: {
      ok: false,
      length: 46,
      titleLimit: 70,
      problems: [{ kind: 'unsupported_figure', text: '$48,000', message: 'This title states a figure the script doesn’t support. The script never says $48,000.', supportedFigures: ['50%', '6%'] }],
    },
  },
  'too-long': {
    title: 'The 401(k) rule nobody explains at work, and why it quietly costs most people thousands of dollars',
    check: { ok: false, length: 99, titleLimit: 70, problems: [{ kind: 'too_long', text: null, message: 'Titles can be 70 characters at most. Cut 29 characters to save.', supportedFigures: [] }] },
  },
  'empty': { title: '', check: { ok: false, length: 0, titleLimit: 70, problems: [{ kind: 'empty', text: null, message: 'The title is empty.', supportedFigures: [] }] } },
};

export const THUMBNAIL_FIXTURES: Record<string, ThumbnailResult> = {
  'live': { status: 'live', reasonText: null, source: 'package', packageId: 'p1', fileUrl: '' },
  'not-applied': { status: 'not_applied', reasonText: '(sample) YouTube said the channel can’t use custom thumbnails yet.', source: 'package', packageId: 'p1', fileUrl: '/x' },
  'pending': { status: 'pending', reasonText: null, source: 'package', packageId: 'p1', fileUrl: '' },
  'not-set': { status: 'not_set', reasonText: null, source: 'youtube-suggested', packageId: null, fileUrl: null },
  'frame-grab': { status: 'live', reasonText: null, source: 'frame-grab', packageId: null, fileUrl: null },
};

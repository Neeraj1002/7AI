import { describe, expect, it } from 'vitest';
import { PACKAGING_OUTPUT_VERSION, type PackageRecord, type PackagingOutput } from './build';
import { checkPackageTitle, packagingRound, packagingState, supportedFiguresIn, thumbnailResult } from './gate2-contract';
import { resolveChoice } from './choice';
import { buildPackagingView, buildShortView } from './view';
import { EIFFEL_SCRIPT, makeBrief, makeConcept } from './testkit';

const pkg = (id: string, over: Partial<PackageRecord> = {}): PackageRecord => ({
  id, device: 'stake', supportingDevice: null, title: 'Why was it nearly torn down?', question: 'q?',
  answeredAt: { chapter: 3, chapterTitle: 'Why It Stayed', startSec: 60, label: 'x', quote: 'q' },
  recipe: { concept: makeConcept().thumbnail, faceMode: 'none', typeface: 'stakes', typefaceFamily: 'Anton', prompt: 'p', imageModel: 'm' },
  lettering: { words: 'SOLD FOR SCRAP?', subline: null, sublineDropped: false, typeface: 'stakes', fontFamily: 'Anton', zone: 'top', requestedZone: 'top', zonesByCalm: ['top', 'bottom', 'left', 'right'], textBox: { x0: 0, y0: 0, x1: 1, y1: 1 }, lines: 1, mainPxFull: 100, mainPxFeed: 28, mainPxSidebar: 13, readableAtSidebar: true },
  files: { full: 'a', feed: 'b', sidebar: 'c' }, coldReader: null, imageCostUsd: 0.0065, ...over,
});
const packaging = (over: Partial<PackagingOutput> = {}): PackagingOutput => ({
  version: PACKAGING_OUTPUT_VERSION, status: 'ready', reason: null, scriptHash: 'h', brief: makeBrief(), faceMode: 'none', typeface: 'stakes', titleLimit: 70,
  concepts: [], dropped: [], packages: [pkg('c1')], textCostUsd: 0.1, imageCostUsd: 0.02, ...over,
});

describe('packagingState (B1: making, pending)', () => {
  const at = { runStatus: 'paused_gate2', isLong: true };
  it('is making while the packages are made before the approval is open, whether nothing is saved yet or a checkpoint is', () => {
    expect(packagingState({ ...at, packaging: null, approvalOpen: false })).toEqual({ making: true, pending: false });
    expect(packagingState({ ...at, packaging: packaging({ status: 'building' }), approvalOpen: false })).toEqual({ making: true, pending: false });
  });
  it('is pending, not making, when the approval is open and there is no packaging (a restart, a channel with none)', () => {
    expect(packagingState({ ...at, packaging: null, approvalOpen: true })).toEqual({ making: false, pending: true });
  });
  it('is neither once the packaging is finished, for a Short, or anywhere but Gate 2', () => {
    for (const status of ['ready', 'weak_gap', 'none_passed', 'skipped', 'failed'] as const) {
      expect(packagingState({ ...at, packaging: packaging({ status }), approvalOpen: false })).toEqual({ making: false, pending: false });
    }
    expect(packagingState({ ...at, isLong: false, packaging: null, approvalOpen: false })).toEqual({ making: false, pending: false });
    expect(packagingState({ runStatus: 'running', isLong: true, packaging: null, approvalOpen: false })).toEqual({ making: false, pending: false });
    expect(packagingState({ runStatus: 'completed', isLong: true, packaging: null, approvalOpen: false })).toEqual({ making: false, pending: false });
  });
});

describe('the view for each designer state (B1 fixtures)', () => {
  const view = (p: PackagingOutput) => buildPackagingView({ runId: 'r', packaging: p, videoSeconds: 125 });
  it.each([
    ['ready', packaging(), 'ready', 1],
    ['weak gap', packaging({ status: 'weak_gap', reason: 'nothing to ask', packages: [] }), 'weak_gap', 0],
    ['none passed', packaging({ status: 'none_passed', reason: 'Nothing passed', packages: [], dropped: [{ id: 'c1', title: 't', device: 'how', stage: 'payoff', reasons: ['r'] }] }), 'none_passed', 0],
    ['spend limit skipped', packaging({ status: 'skipped', reason: 'no room', packages: [] }), 'skipped', 0],
    ['failed', packaging({ status: 'failed', reason: 'Packaging failed: x', packages: [] }), 'failed', 0],
  ])('%s', (_label, p, status, count) => {
    const v = view(p);
    expect(v.status).toBe(status);
    expect(v.packages).toHaveLength(count);
    expect(v.kind).toBe('long');
    expect(v.titleLimit).toBe(70);
  });
  it('round two: round 2 on the view and on the package, and the cost counts both rounds', () => {
    const v = view(packaging({ packages: [pkg('r2-c1', { round: 2 })], rounds: [{ round: 1 } as never, { round: 2 } as never], roundTwo: { state: 'finished', reason: null, feedback: [] } }));
    expect(v.round).toBe(2);
    expect(v.packages[0].round).toBe(2);
    expect(v.secondRound.state).toBe('finished');
    expect(packagingRound(packaging())).toBe(1);
  });
  it('splits the answer place into parts, with the chapter time from the current video', () => {
    const v = buildPackagingView({ runId: 'r', packaging: packaging(), chapterTimings: [{ title: 'Why It Stayed', startSec: 93.4, endSec: 120 }] });
    expect(v.packages[0].answeredAtParts).toEqual({ chapter: 3, chapterTitle: 'Why It Stayed', startSec: 93 });
    expect(v.packages[0].answeredAt).toMatch(/about 1:33/);
    expect(v.packages[0].hookLine).toBeNull();
    expect(v.packages[0].firstFrameUrl).toBeNull();
    expect(v.packages[0].imageUrls?.full).toBe('/runs/r/thumbnail/c1/full');
  });
  it('uses the stored packaging cost unless the router passes the usage-row total', () => {
    expect(view(packaging()).packagingCostUsd).toBeCloseTo(0.12, 4);
    expect(buildPackagingView({ runId: 'r', packaging: packaging(), packagingCostUsd: 0.1371 }).packagingCostUsd).toBe(0.1371);
  });
});

describe('a Short (B1): hook line and first frame, no 16:9 picture, nothing to choose', () => {
  const opening = { hookLine: 'Why was it nearly torn down?', firstStillPrompt: 'scene', question: 'Why?', device: 'stake', note: null, reasons: [], textCostUsd: 0.012, answerQuote: 'a quote' };
  it('has one package with the hook line and a signed first-frame link, and imageUrls null', () => {
    const v = buildShortView({ runId: 'r', opening, frameExists: true, linkFor: (id, size) => `/runs/r/thumbnail/${id}/${size}?t=x` });
    expect(v.kind).toBe('short');
    expect(v.status).toBe('ready');
    expect(v.packages).toHaveLength(1);
    expect(v.packages[0]).toMatchObject({ id: 'opening', hookLine: 'Why was it nearly torn down?', imageUrls: null, firstFrameUrl: '/runs/r/thumbnail/opening/frame?t=x', title: '' });
    expect(v.packagingCostUsd).toBe(0.012);
  });
  it('has no first-frame link until the frame exists, and says plainly when there is no opening at all', () => {
    expect(buildShortView({ runId: 'r', opening, frameExists: false }).packages[0].firstFrameUrl).toBeNull();
    const none = buildShortView({ runId: 'r', opening: { ...opening, hookLine: null, firstStillPrompt: null, reasons: ['No honest gap in the script: x'] }, frameExists: false });
    expect(none.status).toBe('none_passed');
    expect(none.reason).toMatch(/No honest gap/);
    expect(none.packages).toHaveLength(0);
  });
});

describe('checkPackageTitle agrees with what choosePackage refuses (B3)', () => {
  const p = packaging();
  const cases: Array<[string, string, string, RegExp | null]> = [
    ['a figure the script does not support', 'Why did 99 engineers nearly lose it?', 'unsupported_figure', /99/],
    ['an over-length title', 'Why was this enormous iron tower nearly torn down after only twenty years of standing here?', 'too_long', /limit is 70/],
    ['an empty title', '   ', 'empty', null],
    ['an unearned word', 'The untold story of the tower', 'other', /untold/],
  ];
  it.each(cases)('%s: the live check and the save refuse the same way', (_label, title, kind, pattern) => {
    const check = checkPackageTitle({ title, packaging: p, packageId: 'c1', scriptText: EIFFEL_SCRIPT });
    if ('error' in check) throw new Error('unexpected');
    expect(check.ok).toBe(false);
    expect(check.problems.map((x) => x.kind)).toContain(kind);
    if (pattern) expect(check.problems.map((x) => x.message).join(' ')).toMatch(pattern);
    expect(check.titleLimit).toBe(70);
    const saved = resolveChoice({ packaging: p, packageId: 'c1', editedTitle: title, scriptText: EIFFEL_SCRIPT, userId: 'u' });
    expect(saved.ok).toBe(false);
    if (!saved.ok) for (const problem of check.problems) expect(saved.message).toContain(problem.message);
  });
  it('a good title is ok in both, the figure is highlighted with what the script does state, and the limit is the server\'s', () => {
    const good = checkPackageTitle({ title: 'How do 18,038 iron pieces survive 20 years?', packaging: p, packageId: 'c1', scriptText: EIFFEL_SCRIPT });
    if ('error' in good) throw new Error('unexpected');
    expect(good).toMatchObject({ ok: true, problems: [], titleLimit: 70, length: 43 });
    expect(resolveChoice({ packaging: p, packageId: 'c1', editedTitle: 'How do 18,038 iron pieces survive 20 years?', scriptText: EIFFEL_SCRIPT, userId: 'u' }).ok).toBe(true);
    const bad = checkPackageTitle({ title: 'Why did 99 engineers nearly lose it?', packaging: p, packageId: 'c1', scriptText: EIFFEL_SCRIPT });
    if ('error' in bad) throw new Error('unexpected');
    expect(bad.problems[0]).toMatchObject({ kind: 'unsupported_figure', text: expect.stringContaining('99') });
    expect(bad.problems[0].supportedFigures).toEqual(expect.arrayContaining(['18,038', '300', '1889']));
    expect(supportedFiguresIn('In 1889 it opened. About 300 metres.')).toEqual(['1889', '300']);
  });
  it('an unknown package is an error, not a pass', () => {
    expect(checkPackageTitle({ title: 'x', packaging: p, packageId: 'nope', scriptText: EIFFEL_SCRIPT })).toEqual({ error: 'unknown_package' });
  });
});

describe('thumbnailResult (B4): only a real success is live', () => {
  const fileUrlFor = (id: string) => `/runs/r/thumbnail/${id}/full?t=x`;
  const pub = (over: object) => ({ youtubeVideoId: 'vid', ...over });
  it('is null until the video is published', () => {
    expect(thumbnailResult({ output: undefined, followup: undefined, fileUrlFor })).toBeNull();
    expect(thumbnailResult({ output: { coverFrameSet: true }, followup: 'succeeded', fileUrlFor })).toBeNull();
  });
  it('live: the chosen package went up; the file is offered', () => {
    expect(thumbnailResult({ output: pub({ coverFrameSet: true, thumbnail: { source: 'package', packageId: 'c1' } }), followup: 'succeeded', fileUrlFor })).toEqual({
      status: 'live', reasonText: null, source: 'package', packageId: 'c1', fileUrl: '/runs/r/thumbnail/c1/full?t=x',
    });
  });
  it('not applied: YouTube refused, with its reason; the video stays published and the file is still offered', () => {
    const r = thumbnailResult({ output: pub({ coverFrameSet: false, coverFrameMessage: 'YouTube refused the cover image (403).', thumbnail: { source: 'package', packageId: 'c1' } }), followup: 'uncertain', fileUrl: undefined, fileUrlFor } as never);
    expect(r).toMatchObject({ status: 'not_applied', reasonText: 'YouTube refused the cover image (403).', source: 'package', fileUrl: '/runs/r/thumbnail/c1/full?t=x' });
  });
  it('pending: the call started and nothing came back, or the step has not finished', () => {
    expect(thumbnailResult({ output: pub({ coverFrameSet: false, thumbnail: { source: 'package', packageId: 'c1' } }), followup: 'started', fileUrlFor })?.status).toBe('pending');
    expect(thumbnailResult({ output: pub({ coverFrameSet: false, thumbnail: { source: 'package', packageId: 'c1' } }), followup: 'uncertain', fileUrlFor })?.status).toBe('pending');
    expect(thumbnailResult({ output: pub({}), followup: 'pending', fileUrlFor })?.status).toBe('pending');
  });
  it("not set: nothing was sent and YouTube chose its own; no reason, no file", () => {
    expect(thumbnailResult({ output: pub({ coverFrameSet: false, coverFrameMessage: "You kept YouTube's suggested thumbnail.", thumbnail: { source: 'youtube-suggested' } }), followup: 'pending', fileUrlFor })).toEqual({
      status: 'not_set', reasonText: null, source: 'youtube-suggested', packageId: null, fileUrl: null,
    });
  });
  it('a frame grab keeps today\'s meaning: live or not applied, never a file', () => {
    expect(thumbnailResult({ output: pub({ coverFrameSet: true, thumbnail: { source: 'frame-grab' } }), followup: 'succeeded', fileUrlFor })).toMatchObject({ status: 'live', source: 'frame-grab', fileUrl: null });
    expect(thumbnailResult({ output: pub({ coverFrameSet: false, coverFrameMessage: 'The cover image was not set.', thumbnail: { source: 'frame-grab' } }), followup: 'uncertain', fileUrlFor })).toMatchObject({ status: 'not_applied', source: 'frame-grab', fileUrl: null });
  });
});

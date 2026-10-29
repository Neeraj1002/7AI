import { describe, expect, it } from 'vitest';
import { PACKAGING_OUTPUT_VERSION, type PackageRecord, type PackagingOutput } from './build';
import { buildDeviceStats, buildPackagingRecord } from './record';
import { makeBrief, makeConcept } from './testkit';

const pkg = (id: string, device: PackageRecord['device'], over: Partial<PackageRecord> = {}): PackageRecord => ({
  id, device, supportingDevice: null, title: `Title ${id}`, question: 'q?', answeredAt: { chapter: null, chapterTitle: null, startSec: null, label: 'In the script', quote: 'x' },
  recipe: { concept: makeConcept().thumbnail, faceMode: 'none', typeface: 'stakes', typefaceFamily: 'Anton', prompt: 'p', imageModel: 'm' },
  lettering: { words: 'W', subline: null, sublineDropped: false, typeface: 'stakes', fontFamily: 'Anton', zone: 'top', requestedZone: 'top', zonesByCalm: ['top', 'bottom', 'left', 'right'], textBox: { x0: 0, y0: 0, x1: 1, y1: 1 }, lines: 1, mainPxFull: 100, mainPxFeed: 28, mainPxSidebar: 13, readableAtSidebar: true },
  files: { full: 'a', feed: 'b', sidebar: 'c' }, coldReader: null, imageCostUsd: 0.0065,
  checks: {
    critic: { about: 'a', expectsToSee: 'b', wantsToKnow: 'c', wouldClick: 'yes', whyNot: '', wouldDisappoint: '', connects: true, connectsWhy: '' },
    payoff: { visibleThings: [], contradicts: false, contradictsWhy: '', questionAnswered: true, answerQuote: 'q', arrives: true, arrivesWhy: '', fakeLabelOrUnearnedWord: false, labelWhy: '' },
    defects: { faceVisible: false, uncannyAtFeed: false, uncannyAtSidebar: false, defects: [], handsOk: true },
    headToHead: { wins: 2, losses: 0, ties: 0, reasons: [] },
  },
  ...over,
});
const packaging = (over: Partial<PackagingOutput> = {}): PackagingOutput => ({
  version: PACKAGING_OUTPUT_VERSION, status: 'ready', reason: null, scriptHash: 'h', brief: makeBrief(), faceMode: 'none', typeface: 'stakes', titleLimit: 70,
  concepts: [], dropped: [
    { id: 'c4', title: 'Dropped idea', device: 'how', stage: 'payoff', reasons: ['The picture shows a toy'], rules: ['scene_not_in_script'], round: 1 },
    { id: 'c5', title: 'Ranked below', device: 'scale', stage: 'cold-reader', reasons: ['Ranked below the three kept.'], rules: ['ranked_below_kept'] },
  ],
  packages: [pkg('c1', 'stake'), pkg('c2', 'mystery'), pkg('r2-c1', 'countdown', { round: 2 })], textCostUsd: 0.1, imageCostUsd: 0.02, ...over,
});
const chosen = (id: string, title: string | null = null, edited = false) => ({ packageId: id, title, titleEdited: edited, chosenAt: 'x', chosenByUserId: 'u' });

describe('buildPackagingRecord (R8): offered, chosen, rejected read back', () => {
  it('a published run: the chosen package with its device, recipe, typeface and check results; the others rejected; drops with their rules', () => {
    const rec = buildPackagingRecord({ packaging: packaging({ choice: chosen('c1', 'My edited title', true), roundTwo: { state: 'finished', reason: null, feedback: [] } }) });
    expect(rec.kind).toBe('long_packages');
    expect(rec.chosenDevice).toBe('stake');
    expect(rec.chosen).toMatchObject({ id: 'c1', device: 'stake', title: 'My edited title', titleEdited: true, typeface: 'Anton', faceMode: 'none' });
    expect(rec.chosen?.recipe.prompt).toBe('p');
    expect(rec.chosen?.critic?.connects).toBe(true);
    expect(rec.chosen?.payoff?.questionAnswered).toBe(true);
    expect(rec.chosen?.headToHead).toEqual({ wins: 2, losses: 0, ties: 0 });
    expect(rec.offered.map((o) => [o.id, o.outcome])).toEqual([['c1', 'chosen'], ['c2', 'rejected'], ['r2-c1', 'rejected'], ['c4', 'dropped']]);
    expect(rec.offered.find((o) => o.id === 'c4')).toMatchObject({ droppedAt: 'payoff', rules: ['scene_not_in_script'] });
    expect(rec.offered.find((o) => o.id === 'r2-c1')?.round).toBe(2);
    expect(rec.secondRound).toBe('finished');
    expect(rec.brief?.question).toBe(makeBrief().question);
  });

  it("keeping YouTube's thumbnail is a record too: nothing chosen, nothing rejected, the options stay listed", () => {
    const rec = buildPackagingRecord({ packaging: packaging({ choice: chosen('youtube-suggested') }) });
    expect(rec.keptYoutube).toBe(true);
    expect(rec.chosen).toBeNull();
    expect(rec.chosenDevice).toBeNull();
    expect(rec.offered.filter((o) => o.outcome === 'not_chosen')).toHaveLength(3);
  });

  it('a Short reads back its opening; a run with neither says none', () => {
    const rec = buildPackagingRecord({ packaging: null, opening: { hookLine: 'Why?', firstStillPrompt: 'scene', question: 'Why was it torn down?', device: 'stake', note: null, reasons: [], brief: { whatPeopleBelieve: 'a', whatTheRecordSays: 'b' } as never } });
    expect(rec).toMatchObject({ kind: 'short_opening', chosenDevice: 'stake', opening: { hookLine: 'Why?', usedFrameZero: true, device: 'stake' } });
    expect(buildPackagingRecord({ packaging: null })).toMatchObject({ kind: 'none', chosenDevice: null, offered: [] });
  });
});

describe('buildDeviceStats: Compare by device, with no invented metric', () => {
  const runs = [
    { runId: 'r1', packaging: packaging({ choice: chosen('c1') }), opening: null },
    { runId: 'r2', packaging: packaging({ choice: chosen('c1') }), opening: null },
    { runId: 'r3', packaging: packaging({ choice: chosen('c2') }), opening: null },
  ];
  it('counts what was offered, dropped and chosen per device, and averages only what the snapshots supply', () => {
    const stats = buildDeviceStats(runs, [
      { runId: 'r1', views: 1000, retentionPct: 40, averageViewDurationSec: 90 },
      { runId: 'r2', views: 3000, retentionPct: null, averageViewDurationSec: null },
    ]);
    const stake = stats.find((s) => s.device === 'stake')!;
    expect(stake).toMatchObject({ chosen: 2, published: 2, avgViews: 2000, avgViewDurationSec: 90, avgRetentionPct: 40, offered: 3, dropped: 0 });
    const mystery = stats.find((s) => s.device === 'mystery')!;
    expect(mystery).toMatchObject({ chosen: 1, published: 0, avgViews: null, avgViewDurationSec: null, avgRetentionPct: null });
    expect(stats.find((s) => s.device === 'how')).toMatchObject({ dropped: 3, offered: 0, chosen: 0 });
    // the most chosen device first
    expect(stats[0].device).toBe('stake');
  });
  it('impressions and click-through rate are always null: the ingestion does not supply them', () => {
    for (const s of buildDeviceStats(runs, [{ runId: 'r1', views: 10, retentionPct: 1, averageViewDurationSec: 1 }])) {
      expect(s.impressions).toBeNull();
      expect(s.clickThroughRate).toBeNull();
    }
  });
  it('a Short counts its opening device as chosen; a run kept on YouTube counts none', () => {
    const stats = buildDeviceStats(
      [
        { runId: 's1', packaging: null, opening: { hookLine: 'h', firstStillPrompt: null, question: 'q', device: 'how', note: null, reasons: [], scriptHash: 'x', answerQuote: '', textCostUsd: 0, builtAt: '', brief: null } },
        { runId: 'k1', packaging: packaging({ choice: chosen('youtube-suggested') }), opening: null },
      ],
      [{ runId: 's1', views: 500, retentionPct: null, averageViewDurationSec: null }],
    );
    expect(stats.find((s) => s.device === 'how')).toMatchObject({ chosen: 1, published: 1, avgViews: 500 });
    expect(stats.reduce((n, s) => n + s.chosen, 0)).toBe(1);
  });
});

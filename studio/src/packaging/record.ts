import type { PackageRecord, PackagingOutput } from './build';
import { YOUTUBE_SUGGESTED } from './constants';
import type { ShortOpening } from './opening';

// R8: what was offered, chosen and rejected for a run, read back from what is already stored (the Gate 2 row's packaging for
// a long video, the run's `opening` for a Short). Nothing new is stored for this: the record is a projection, so it cannot
// drift from the data. Compare groups runs by the chosen device (`deviceStats` below). Metrics the provider and the existing
// ingestion do not supply stay null; nothing here invents one.

export type OfferedEntry = {
  id: string;
  round: 1 | 2;
  device: string;
  title: string;
  // chosen: the founder picked it. rejected: it passed every check but another was chosen. not_chosen: it passed and
  // nothing was chosen (YouTube's thumbnail was kept, or the run was approved without a choice). dropped: a check removed it.
  outcome: 'chosen' | 'rejected' | 'not_chosen' | 'dropped';
  droppedAt?: string;
  rules?: string[];
  reasons?: string[];
};

export type ChosenEntry = {
  id: string;
  round: 1 | 2;
  device: string;
  supportingDevice: string | null;
  title: string;
  titleEdited: boolean;
  question: string;
  typeface: string;
  faceMode: string;
  recipe: PackageRecord['recipe'];
  // The critic and payoff results that let it through.
  critic: NonNullable<PackageRecord['checks']>['critic'] | null;
  payoff: NonNullable<PackageRecord['checks']>['payoff'] | null;
  headToHead: { wins: number; losses: number; ties: number } | null;
};

export type PackagingRecord = {
  kind: 'long_packages' | 'short_opening' | 'none';
  brief: { question: string; whatPeopleBelieve: string; whatTheRecordSays: string; primaryDevice: string } | null;
  // The device the video was packaged around: the chosen package's, or the opening's for a Short; null when nothing custom was chosen.
  chosenDevice: string | null;
  // 'youtube-suggested' when the founder kept YouTube's thumbnail; null when there was no choice to make.
  keptYoutube: boolean;
  offered: OfferedEntry[];
  chosen: ChosenEntry | null;
  // A Short's opening (hook line and frame zero), when there is one.
  opening: { hookLine: string | null; usedFrameZero: boolean; question: string; device: string; note: string | null; reasons: string[] } | null;
  secondRound: 'not_needed' | 'started' | 'finished' | 'skipped';
};

export function buildPackagingRecord(params: { packaging: PackagingOutput | null; opening?: Pick<ShortOpening, 'hookLine' | 'firstStillPrompt' | 'question' | 'device' | 'note' | 'reasons' | 'brief'> | null }): PackagingRecord {
  const { packaging, opening } = params;
  if (!packaging && opening) {
    const brief = opening.brief as { whatPeopleBelieve?: string; whatTheRecordSays?: string } | null;
    return {
      kind: 'short_opening',
      brief: { question: opening.question, whatPeopleBelieve: brief?.whatPeopleBelieve ?? '', whatTheRecordSays: brief?.whatTheRecordSays ?? '', primaryDevice: opening.device },
      chosenDevice: opening.hookLine || opening.firstStillPrompt ? opening.device : null,
      keptYoutube: false,
      offered: [],
      chosen: null,
      opening: { hookLine: opening.hookLine, usedFrameZero: Boolean(opening.firstStillPrompt), question: opening.question, device: opening.device, note: opening.note, reasons: opening.reasons },
      secondRound: 'not_needed',
    };
  }
  if (!packaging) {
    return { kind: 'none', brief: null, chosenDevice: null, keptYoutube: false, offered: [], chosen: null, opening: null, secondRound: 'not_needed' };
  }
  const choice = packaging.choice;
  const keptYoutube = choice?.packageId === YOUTUBE_SUGGESTED;
  const chosenPkg = !keptYoutube && choice ? packaging.packages.find((p) => p.id === choice.packageId) ?? null : null;
  const offered: OfferedEntry[] = [
    ...packaging.packages.map((p): OfferedEntry => ({
      id: p.id,
      round: p.round ?? 1,
      device: p.device,
      title: p.title,
      outcome: chosenPkg ? (p.id === chosenPkg.id ? 'chosen' : 'rejected') : 'not_chosen',
    })),
    ...packaging.dropped
      .filter((d) => !d.rules?.includes('ranked_below_kept'))
      .map((d): OfferedEntry => ({ id: d.id, round: d.round ?? 1, device: d.device, title: d.title, outcome: 'dropped', droppedAt: d.stage, rules: d.rules ?? [], reasons: d.reasons })),
  ];
  const brief = packaging.brief;
  return {
    kind: 'long_packages',
    brief: brief ? { question: brief.question, whatPeopleBelieve: brief.whatPeopleBelieve, whatTheRecordSays: brief.whatTheRecordSays, primaryDevice: brief.primaryDevice } : null,
    chosenDevice: chosenPkg?.device ?? null,
    keptYoutube,
    offered,
    chosen: chosenPkg
      ? {
          id: chosenPkg.id,
          round: chosenPkg.round ?? 1,
          device: chosenPkg.device,
          supportingDevice: chosenPkg.supportingDevice,
          title: choice!.title ?? chosenPkg.title,
          titleEdited: choice!.titleEdited,
          question: chosenPkg.question,
          typeface: chosenPkg.recipe.typefaceFamily,
          faceMode: chosenPkg.recipe.faceMode,
          recipe: chosenPkg.recipe,
          critic: chosenPkg.checks?.critic ?? null,
          payoff: chosenPkg.checks?.payoff ?? null,
          headToHead: chosenPkg.checks ? { wins: chosenPkg.checks.headToHead.wins, losses: chosenPkg.checks.headToHead.losses, ties: chosenPkg.checks.headToHead.ties } : null,
        }
      : null,
    opening: null,
    secondRound: packaging.roundTwo?.state ?? 'not_needed',
  };
}

// ---- Compare by device -------------------------------------------------------------------------------------------------

export type DeviceRunRow = {
  runId: string;
  packaging: PackagingOutput | null;
  opening: ShortOpening | null;
};
export type DeviceSnapshotRow = { runId: string; views: number; retentionPct: number | null; averageViewDurationSec: number | null };

export type DeviceStat = {
  device: string;
  // Options of this device shown to the founder (passed every check) and options of it that were dropped by a check.
  offered: number;
  dropped: number;
  // Times the founder chose it, and (for a Short) the opening was built around it.
  chosen: number;
  // Published videos packaged around this device that have a snapshot, and their averages. Null when no snapshot supplies it.
  published: number;
  avgViews: number | null;
  avgViewDurationSec: number | null;
  avgRetentionPct: number | null;
  // The provider and the existing ingestion do not supply impressions or click-through rate (LongFormMetrics.impressionsClickThroughRate is
  // always null), so they are null, never estimated.
  impressions: null;
  clickThroughRate: null;
};

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);

export function buildDeviceStats(runs: DeviceRunRow[], snapshots: DeviceSnapshotRow[]): DeviceStat[] {
  const stats = new Map<string, DeviceStat & { views: number[]; durations: number[]; retentions: number[] }>();
  const get = (device: string) => {
    let s = stats.get(device);
    if (!s) {
      s = { device, offered: 0, dropped: 0, chosen: 0, published: 0, avgViews: null, avgViewDurationSec: null, avgRetentionPct: null, impressions: null, clickThroughRate: null, views: [], durations: [], retentions: [] };
      stats.set(device, s);
    }
    return s;
  };
  const snapshotOf = new Map(snapshots.map((s) => [s.runId, s]));
  for (const run of runs) {
    const record = buildPackagingRecord({ packaging: run.packaging, opening: run.opening });
    for (const o of record.offered) {
      if (o.outcome === 'dropped') get(o.device).dropped += 1;
      else get(o.device).offered += 1;
    }
    if (!record.chosenDevice) continue;
    const s = get(record.chosenDevice);
    s.chosen += 1;
    const snap = snapshotOf.get(run.runId);
    if (!snap) continue;
    s.published += 1;
    s.views.push(snap.views);
    if (snap.averageViewDurationSec !== null) s.durations.push(snap.averageViewDurationSec);
    if (snap.retentionPct !== null) s.retentions.push(snap.retentionPct);
  }
  return [...stats.values()]
    .map(({ views, durations, retentions, ...s }) => ({ ...s, avgViews: mean(views), avgViewDurationSec: mean(durations), avgRetentionPct: mean(retentions) }))
    .sort((a, b) => b.chosen - a.chosen || b.offered - a.offered || a.device.localeCompare(b.device));
}

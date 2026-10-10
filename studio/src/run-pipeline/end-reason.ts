import { CANCELLED_BY_USER } from '../models/repositories/pipeline-run.repository';

// Bugs Task 12 (R3) - the ONE definition of why a failed-status run ended, shared by runs.get
// (endReason), the Dashboard counts and (via runs.list's lastError) the app's Ended-runs chips.
//
// It reads lastError text on purpose: it is written in the same statement that ends the run, so it
// exists on every row, old and new. `cancelRequested` is memory-only (lost on restart) and the
// stored gate decision only exists for rejections, so neither alone can classify legacy rows.
export type EndReason = 'rejected' | 'cancelled' | 'failed' | 'channel_deleted';

export function classifyEndError(lastError: string | null | undefined): EndReason {
  const err = lastError ?? '';
  if (err.startsWith('Rejected at Gate 1') || err.startsWith('Rejected at Gate 2')) return 'rejected';
  if (err === CANCELLED_BY_USER) return 'cancelled';
  if (err === 'Channel deleted') return 'channel_deleted';
  return 'failed';
}

export type RunEndCounts = {
  published: number;
  failed: number;
  rejected: number;
  // Cancelled by the founder, or ended because the channel was deleted. Excluded from the rate.
  cancelled: number;
};

// failedGroups: failed-status runs grouped by lastError. Success rate = published / (published +
// failed + rejected); cancelled runs are in neither the numerator nor the denominator.
export function tallyEndedRuns(published: number, failedGroups: { lastError: string | null; count: number }[]): RunEndCounts & { rate: number | null } {
  const counts: RunEndCounts = { published, failed: 0, rejected: 0, cancelled: 0 };
  for (const g of failedGroups) {
    const reason = classifyEndError(g.lastError);
    if (reason === 'rejected') counts.rejected += g.count;
    else if (reason === 'failed') counts.failed += g.count;
    else counts.cancelled += g.count;
  }
  const denominator = counts.published + counts.failed + counts.rejected;
  return { ...counts, rate: denominator > 0 ? counts.published / denominator : null };
}

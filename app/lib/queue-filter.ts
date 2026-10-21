// Sprint 4 Frontend Task 2 (R4) — search and filters over the runs the Queue has already loaded. Nothing here calls
// the backend.
import { endedChip, runTopic } from './run-labels';

type FilterableRun = {
  channelId: string;
  briefText: string;
  intakeParsed?: { topic?: string } | null;
};

/** Case-insensitive match on the run's topic line or its brief; an empty search matches everything. */
export function matchesSearch(run: FilterableRun, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return runTopic(run).toLowerCase().includes(needle) || run.briefText.toLowerCase().includes(needle);
}

export function filterRuns<T extends FilterableRun>(runs: readonly T[], search: string, channelId: string | null): T[] {
  return runs.filter((r) => (channelId === null || r.channelId === channelId) && matchesSearch(r, search));
}

export type StatusFilter = 'All' | 'Published' | 'Cancelled' | 'Failed';
export const STATUS_FILTERS: readonly StatusFilter[] = ['All', 'Published', 'Cancelled', 'Failed'];

/** Rejected runs and deleted-channel runs appear under "All" only. */
export function matchesStatusFilter(run: { status: string; lastError?: string | null }, filter: StatusFilter): boolean {
  if (filter === 'All') return true;
  const label = endedChip(run).label;
  return label === filter;
}

/** Words for the empty "Recent runs" list: it says which filter hides the runs, so an empty list is never a mystery. */
export function emptyRecentMessage(args: { statusFilter: StatusFilter; channelName: string | null; endedCount: number; searching: boolean }): string {
  const { statusFilter, channelName, endedCount, searching } = args;
  if (endedCount === 0) return 'No ended runs yet.';
  const what = statusFilter === 'All' ? 'ended runs' : `${statusFilter.toLowerCase()} runs`;
  const where = channelName ? ` in ${channelName}` : '';
  return `No ${what}${where}${searching ? ' match your search' : ''}.`;
}

// Sprint 4 Frontend Task 2 (R4). Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { filterRuns, matchesSearch, matchesStatusFilter, emptyRecentMessage } from './queue-filter';

const run = (channelId: string, topic: string, brief = topic) => ({ channelId, briefText: brief, intakeParsed: { topic } });

describe('queue search and channel filter', () => {
  const runs = [run('c1', 'Great Wall from space'), run('c1', 'Pheidippides run'), run('c2', 'Octopus hearts')];
  it('matches the topic case-insensitively and ignores surrounding spaces', () => {
    expect(matchesSearch(runs[0], '  great wall ')).toBe(true);
    expect(matchesSearch(runs[0], 'octopus')).toBe(false);
    expect(matchesSearch(runs[0], '')).toBe(true);
  });
  it('also matches words in the brief', () => {
    expect(matchesSearch(run('c1', 'Short topic', 'Tell the story of Lake Placid'), 'placid')).toBe(true);
  });
  it('combines the channel filter with the search', () => {
    expect(filterRuns(runs, '', 'c1')).toHaveLength(2);
    expect(filterRuns(runs, 'run', 'c1')).toHaveLength(1);
    expect(filterRuns(runs, 'octopus', 'c1')).toHaveLength(0);
    expect(filterRuns(runs, '', null)).toHaveLength(3);
  });
});

describe('recent runs status filter', () => {
  const published = { status: 'completed' };
  const cancelled = { status: 'failed', lastError: 'Cancelled by user' };
  const failed = { status: 'failed', lastError: 'Retry limit reached' };
  const rejected = { status: 'failed', lastError: 'Rejected at Gate 2: nope' };
  it('uses the same words as the Run screen', () => {
    expect(matchesStatusFilter(published, 'Published')).toBe(true);
    expect(matchesStatusFilter(cancelled, 'Cancelled')).toBe(true);
    expect(matchesStatusFilter(failed, 'Failed')).toBe(true);
    expect(matchesStatusFilter(failed, 'Cancelled')).toBe(false);
  });
  it('keeps rejected runs under All only', () => {
    expect(matchesStatusFilter(rejected, 'All')).toBe(true);
    expect(matchesStatusFilter(rejected, 'Failed')).toBe(false);
  });
});

describe('emptyRecentMessage', () => {
  it('names the status and the channel that hide the runs', () => {
    expect(emptyRecentMessage({ statusFilter: 'Failed', channelName: 'Not In Your Textbook', endedCount: 12, searching: false })).toBe('No failed runs in Not In Your Textbook.');
    expect(emptyRecentMessage({ statusFilter: 'All', channelName: null, endedCount: 12, searching: true })).toBe('No ended runs match your search.');
    expect(emptyRecentMessage({ statusFilter: 'Failed', channelName: null, endedCount: 12, searching: false })).toBe('No failed runs.');
  });
  it('says there are none yet when nothing has ended', () => {
    expect(emptyRecentMessage({ statusFilter: 'Failed', channelName: 'X', endedCount: 0, searching: false })).toBe('No ended runs yet.');
  });
});

describe('Failed filter rule (Sprint 5 Task 7 R10.6)', () => {
  it('a run whose final state is failed is under Failed; a published run with failed attempts is not', () => {
    expect(matchesStatusFilter({ status: 'failed', lastError: 'OpenAI API call failed: 400' }, 'Failed')).toBe(true);
    expect(matchesStatusFilter({ status: 'completed', lastError: null }, 'Failed')).toBe(false);
    expect(matchesStatusFilter({ status: 'completed', lastError: 'Gate 2 regen cap' }, 'Published')).toBe(true);
    expect(matchesStatusFilter({ status: 'failed', lastError: 'Cancelled by user' }, 'Failed')).toBe(false);
    expect(matchesStatusFilter({ status: 'failed', lastError: 'Cancelled by user' }, 'Cancelled')).toBe(true);
  });
});

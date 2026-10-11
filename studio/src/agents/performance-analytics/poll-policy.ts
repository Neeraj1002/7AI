// Bugs Task 12 (R10.7) - the poll used to re-read every historical published video forever. A video
// is polled normally for POLL_WINDOW_DAYS after publishing; after that it gets one final snapshot
// (the first poll past the window) and is then left alone.
export const POLL_WINDOW_DAYS = 30;

export type PollAction = 'poll' | 'final' | 'skip';

export function decidePoll(input: { now: number; publishedAt: Date | null; lastSnapshotAt: Date | null }): PollAction {
  if (!input.publishedAt) return 'poll';
  const windowEnd = input.publishedAt.getTime() + POLL_WINDOW_DAYS * 86_400_000;
  if (input.now <= windowEnd) return 'poll';
  if (input.lastSnapshotAt && input.lastSnapshotAt.getTime() >= windowEnd) return 'skip';
  return 'final';
}

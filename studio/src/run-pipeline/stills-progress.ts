// Sprint 4 Task 12 (R4): a still-image counter for runs.progress. The video_generation stage stores
// `{ stillsProgress: { done, total } }` in its own output JSON while it runs (no new column); the
// first and last values are always stored, the ones in between at most every 5 seconds. A failed
// write never fails the stage: the counter is only a hint for the app.

export type StillsProgress = { done: number; total: number };

export const STILLS_PROGRESS_INTERVAL_MS = 5000;

export function createStillsProgressReporter(
  write: (progress: StillsProgress) => Promise<unknown>,
  options: { intervalMs?: number; now?: () => number } = {},
) {
  const intervalMs = options.intervalMs ?? STILLS_PROGRESS_INTERVAL_MS;
  const now = options.now ?? Date.now;
  let lastWriteAt = Number.NEGATIVE_INFINITY;
  let pending: StillsProgress | null = null;
  let chain: Promise<void> = Promise.resolve();

  const send = (progress: StillsProgress) => {
    lastWriteAt = now();
    pending = null;
    chain = chain.then(() => write(progress)).then(
      () => undefined,
      () => undefined,
    );
  };

  return {
    report(progress: StillsProgress) {
      if (progress.done === 0 || progress.done >= progress.total || now() - lastWriteAt >= intervalMs) send(progress);
      else pending = progress;
    },
    // Stores the newest value that was held back and waits for every write, so none lands after the
    // stage has been completed or failed.
    async flush() {
      if (pending) send(pending);
      await chain;
    },
  };
}

// What runs.progress reads from a stage's output while it runs; undefined when absent or malformed.
export function readStillsProgress(output: unknown): StillsProgress | undefined {
  const value = (output as { stillsProgress?: { done?: unknown; total?: unknown } } | null | undefined)?.stillsProgress;
  if (!value || typeof value.done !== 'number' || typeof value.total !== 'number') return undefined;
  return { done: value.done, total: value.total };
}

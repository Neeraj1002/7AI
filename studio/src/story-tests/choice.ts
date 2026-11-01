import type { StoredStoryTests } from './schemas';

// R3. Applies the founder's choice to the stored Part A record. Pure: the caller persists it. `angleId: null` is
// "write from the brief" (skip). Returns an error word the caller turns into BAD_REQUEST or CONFLICT.
export function applyAngleChoice(
  stored: StoredStoryTests,
  angleId: string | null,
  now: Date,
): { ok: true; next: StoredStoryTests } | { ok: false; error: 'unknown_angle' | 'not_waiting' } {
  const step = stored.angleStep;
  if (step.status !== 'waiting') return { ok: false, error: 'not_waiting' };
  if (angleId !== null && !step.angles.some((a) => a.id === angleId)) return { ok: false, error: 'unknown_angle' };
  const choseReaderPick = angleId !== null && step.readerTopId !== null ? angleId === step.readerTopId : null;
  return {
    ok: true,
    next: {
      ...stored,
      angleStep: { ...step, status: angleId === null ? 'skipped' : 'chosen', chosenId: angleId, choseReaderPick, chosenAt: now.toISOString() },
      tags: { ...stored.tags, partA: angleId === null ? 'skipped' : 'used' },
    },
  };
}

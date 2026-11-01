import { READER_ID_POOL } from './constants';
import type { PairReaderReply, StoredAngle, StoredMark, StoredReaderRun } from './schemas';

// R2. The blind pair reader's input and the code verdict. Pure, so every rule is tested without a model.

export type Rng = () => number;

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// A neutral id per angle, drawn at random from a pool of letters: not the angle's id and not its position.
export function assignReaderIds(angles: StoredAngle[], rng: Rng): Record<string, string> {
  const pool = shuffled(READER_ID_POOL, rng);
  return Object.fromEntries(angles.map((a, i) => [a.id, pool[i]!]));
}

// Run 1 sees a shuffle; run 2 sees exactly that order reversed.
export function readerOrders(angles: StoredAngle[], rng: Rng): { first: string[]; second: string[] } {
  const first = shuffled(angles.map((a) => a.id), rng);
  return { first, second: [...first].reverse() };
}

// What a reader is shown: neutral id, title, promise. Nothing else.
export function readerItems(angles: StoredAngle[], order: string[], shownAs: Record<string, string>): Array<{ id: string; title: string; promise: string }> {
  const byId = new Map(angles.map((a) => [a.id, a]));
  return order.map((angleId) => {
    const a = byId.get(angleId)!;
    return { id: shownAs[angleId]!, title: a.title, promise: a.promise };
  });
}

// Maps one reply back to angle ids. An unknown id, a click equal to the skip, or a missing line makes the run invalid.
export function mapReaderReply(reply: PairReaderReply, run: 1 | 2, order: string[], shownAs: Record<string, string>): StoredReaderRun {
  const base = { run, order, shownAs };
  const angleOf = new Map(Object.entries(shownAs).map(([angleId, shown]) => [shown, angleId]));
  const click = angleOf.get(reply.click.id.trim());
  const skip = angleOf.get(reply.skip.id.trim());
  if (!click || !skip) return { ...base, clickId: null, clickWhy: null, skipId: null, skipWhy: null, error: 'the reader named an id it was not shown' };
  if (click === skip) return { ...base, clickId: null, clickWhy: null, skipId: null, skipWhy: null, error: 'the reader chose the same video to click and to skip' };
  const clickWhy = reply.click.why.trim();
  const skipWhy = reply.skip.why.trim();
  if (!clickWhy || !skipWhy) return { ...base, clickId: null, clickWhy: null, skipId: null, skipWhy: null, error: 'the reader left out a reason' };
  return { ...base, clickId: click, clickWhy, skipId: skip, skipWhy, error: null };
}

export function failedReaderRun(run: 1 | 2, order: string[], shownAs: Record<string, string>, error: string): StoredReaderRun {
  return { run, order, shownAs, clickId: null, clickWhy: null, skipId: null, skipWhy: null, error };
}

// Both runs valid and the same top angle: a clear winner. Anything else is "no clear winner"; an invalid or missing run
// is the reader-error variant. No third call breaks a tie.
export function decideMark(runs: StoredReaderRun[]): { mark: StoredMark; readerTopId: string | null } {
  const valid = runs.length === 2 && runs.every((r) => r.error === null && r.clickId);
  if (!valid) return { mark: 'no_clear_winner_reader_error', readerTopId: null };
  if (runs[0]!.clickId === runs[1]!.clickId) return { mark: 'clear_winner', readerTopId: runs[0]!.clickId };
  return { mark: 'no_clear_winner', readerTopId: null };
}

export function markLabel(mark: StoredMark): string {
  if (mark === 'clear_winner') return 'Both reads picked the same angle';
  if (mark === 'no_clear_winner') return 'The two reads picked different angles';
  return 'The reader could not give a usable answer, so there is no pick';
}

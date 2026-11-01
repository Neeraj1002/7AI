import { normalizedNumbers } from '../agents/script-review/brief-checks';
import { numericSourceText } from '../agents/script-review/numbers';
import { ANGLES_MAX, ANGLES_MIN, PROMISE_MAX_CHARS, TITLE_MAX_CHARS } from './constants';
import type { AngleReply, StoredAngle } from './schemas';

// R1. Plain-code validation of the angle call's reply. Returns the angles with their ids, or the one reason the part
// is recorded as "not run". There is no retry.
export function validateAngles(reply: AngleReply): { ok: true; angles: Array<{ id: string; title: string; promise: string }> } | { ok: false; reason: string } {
  const count = reply.angles.length;
  if (count < ANGLES_MIN || count > ANGLES_MAX) {
    return { ok: false, reason: `the reply had ${count} angles, not ${ANGLES_MIN} to ${ANGLES_MAX}` };
  }
  const seen = new Set<string>();
  const angles: Array<{ id: string; title: string; promise: string }> = [];
  for (const [i, raw] of reply.angles.entries()) {
    const title = raw.title.trim();
    const promise = raw.promise.trim();
    if (!title || !promise) return { ok: false, reason: `angle ${i + 1} is missing its ${title ? 'promise' : 'title'}` };
    if (title.length > TITLE_MAX_CHARS) return { ok: false, reason: `angle ${i + 1} has a title over ${TITLE_MAX_CHARS} characters` };
    if (promise.length > PROMISE_MAX_CHARS) return { ok: false, reason: `angle ${i + 1} has a promise over ${PROMISE_MAX_CHARS} characters` };
    if (/[\r\n]/.test(promise)) return { ok: false, reason: `angle ${i + 1} has a promise that is not one line` };
    const key = title.toLowerCase();
    if (seen.has(key)) return { ok: false, reason: `two angles share the title "${title}"` };
    seen.add(key);
    angles.push({ id: `a${i + 1}`, title, promise });
  }
  return { ok: true, angles };
}

// R1: Script Review's number reader (brief-checks.ts) used as-is. A figure in a promise that the intake text never
// gives is shown on the card; it is a flag, never a block.
export function figureFlagFor(promise: string, sourceText: string): string | null {
  const known = new Set(normalizedNumbers(numericSourceText(sourceText)));
  const missing = [...new Set(normalizedNumbers(promise))].filter((n) => !known.has(n));
  if (missing.length === 0) return null;
  return `This promise uses ${missing.length === 1 ? 'a figure' : 'figures'} (${missing.join(', ')}) that your brief does not give.`;
}

export function withFigureFlags(angles: Array<{ id: string; title: string; promise: string }>, sourceText: string): StoredAngle[] {
  return angles.map((a) => ({ ...a, figureFlag: figureFlagFor(a.promise, sourceText) }));
}

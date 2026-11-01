import { createHash } from 'node:crypto';
import { sentenceSpans } from '../agents/script-review/numbers';
import { LONG_SWIPE_FRACTION, SHORT_SWIPE_SENTENCES } from './constants';
import type { ColdReaderReply, PromiseMatchReply, ScriptCheckReasonCode } from './schemas';

// R5: the verdict by plain code. No model decides pass or fail; the reader only answers the six fields.

export type SwipePosition =
  | { kind: 'none' }
  | { kind: 'not_found' }
  | { kind: 'found'; startIndex: number; percent: number; early: boolean };

const CANT_TELL = /^\s*["'\u201c]?can['\u2019]?t tell\b/i;
export function saysCantTell(whyCare: string): boolean {
  return CANT_TELL.test(whyCare);
}

// Finds the reader's swipe line in the script text by exact string match (code, not the reader's say-so), then places it:
// early when it starts inside the Short's first sentences or the long script's first share by position.
export function locateSwipe(scriptText: string, swipeLine: string, format: 'short' | 'long'): SwipePosition {
  const line = swipeLine.trim();
  if (!line || /^["'\u201c]?none["'\u201d.]*$/i.test(line)) return { kind: 'none' };
  const startIndex = scriptText.indexOf(line);
  if (startIndex < 0) return { kind: 'not_found' };
  const percent = scriptText.length > 0 ? (startIndex / scriptText.length) * 100 : 0;
  let early: boolean;
  if (format === 'short') {
    const spans = sentenceSpans(scriptText);
    const zoneEnd = spans[Math.min(SHORT_SWIPE_SENTENCES, spans.length) - 1]?.end ?? 0;
    early = startIndex < zoneEnd;
  } else {
    early = startIndex / scriptText.length < LONG_SWIPE_FRACTION;
  }
  return { kind: 'found', startIndex, percent: Math.round(percent * 10) / 10, early };
}

export type Verdict =
  | { ok: true; verdict: 'pass' | 'fail'; reasons: ScriptCheckReasonCode[]; swipe: SwipePosition }
  | { ok: false; reason: string };

// A swipe line that cannot be found in the script is a reader error, not a pass. `match` is null when the match check did
// not run (no chosen angle, or the call failed); that never causes a FAIL.
export function decideVerdict(params: { scriptText: string; format: 'short' | 'long'; reader: ColdReaderReply; match: PromiseMatchReply | null }): Verdict {
  const swipe = locateSwipe(params.scriptText, params.reader.swipe_line, params.format);
  if (swipe.kind === 'not_found') return { ok: false, reason: 'the reader quoted a line that is not in the script' };
  const reasons: ScriptCheckReasonCode[] = [];
  if (saysCantTell(params.reader.why_care)) reasons.push('cant_tell');
  if (swipe.kind === 'found' && swipe.early) reasons.push('swipe_early');
  if (params.reader.first_sentence_keeps_me.keeps === 'no') reasons.push('first_sentence_no');
  if (params.match && (params.match.about.match === 'no' || params.match.remembered.match === 'no')) reasons.push('promise_mismatch');
  return { ok: true, verdict: reasons.length > 0 ? 'fail' : 'pass', reasons, swipe };
}

// Server wording (contract C3). The app shows these as given.
export const VERDICT_LABELS = { pass: 'Reads well to a stranger', fail: 'A stranger may swipe away' } as const;
export const REASON_LABELS: Record<ScriptCheckReasonCode, string> = {
  cant_tell: 'The reader could not tell why anyone would care',
  swipe_early: 'The reader would swipe away at the very start',
  first_sentence_no: 'The first sentence would not keep the reader',
  promise_mismatch: 'What the reader took away does not match the angle you chose',
};
export const ADVISORY_NOTE =
  'A text-only read by a model. It cannot judge voice, pacing or visuals, it is advisory, and it has not been calibrated against real viewers.';

// The script the reader read, as a hash, so a later edit is noticed (no automatic re-run).
export function scriptHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

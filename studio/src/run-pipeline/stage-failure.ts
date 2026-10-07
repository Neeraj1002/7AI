import { getStageErrorContext } from './retry-with-backoff';

// Bugs Task 11 (R1) — what a failed stage row keeps beyond its one-line
// `error`: the raw model reply, for the failures where a reply existed but
// could not be used (an unparseable script). Absent for every other failure,
// so a failed row's `output` stays null exactly as before for them.
export const FAILED_STAGE_RAW_REPLY_CAP = 8000;

export function failureOutputFromError(error: unknown): Record<string, unknown> | undefined {
  const context = getStageErrorContext(error);
  if (!context || typeof context.rawReply !== 'string') return undefined;
  return {
    rawReply: context.rawReply.slice(0, FAILED_STAGE_RAW_REPLY_CAP),
    rawReplyTruncated: context.rawReply.length > FAILED_STAGE_RAW_REPLY_CAP,
    stopReason: context.stopReason ?? null,
    replyLength: context.replyLength ?? null,
    parseError: context.parseError ?? null,
  };
}

// Sprint 5 Task 7 R5 — failure messages in plain words. The failure card used to show the provider's own text cut at 60
// characters, in the middle of a bracket ("OpenAI API call failed: 400 [{'type': 'enum', 'loc': ('bo…"). Known cases get
// a sentence and the setting to change; anything else gets one short sentence, with the full text under Technical details.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One short sentence: the first one, without a trailing bracketed payload, cut at a word and never inside a bracket. */
export function shortSentence(text: string, max = 100): string {
  let s = text.replace(/^\[[^\]]*\]\s*/, '').trim();
  s = s.split(/\r?\n/)[0] ?? s;
  s = s.split(/(?<=[.!?])\s/)[0] ?? s;
  // A payload such as "400 [{'type': …}]" or "(body, voice)" starts at its first opener; drop it.
  const opener = s.search(/\s?[[{]|\s\((?=['"{[])/);
  if (opener > 0) s = s.slice(0, opener);
  s = s.replace(/[\s:,;-]+$/, '');
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    s = `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s:,;-]+$/, '')}…`;
  }
  return s;
}

/** "2026-11-01" or "2026-11-01 00:00:00+00:00" to "1 Nov 2026"; null when there is no date. */
export function returnDate(text: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

function providerName(text: string): string {
  if (/anthropic|claude/i.test(text)) return 'Anthropic';
  if (/openai/i.test(text)) return 'OpenAI';
  if (/elevenlabs/i.test(text)) return 'ElevenLabs';
  if (/google|youtube/i.test(text)) return 'Google';
  return 'The AI provider';
}

export type FailureKind = 'voice' | 'provider_limit' | 'spend_limit' | 'video_review' | 'youtube' | 'other';

export type FailureView = {
  kind: FailureKind;
  /** The one-line headline. */
  title: string;
  /** What to do next, or null. */
  detail: string | null;
  /** The setting the user can change to get past it. */
  fix: 'voice' | 'limit' | null;
  /** The full original text, for Technical details. */
  technical: string;
};

const money = (n: number) => (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2));

export function describeFailure(
  raw: string | null | undefined,
  opts: { spentUsd?: number; maxCostUsd?: number; reviewReason?: string; tries?: number } = {},
): FailureView {
  const text = (raw ?? '').trim();
  const technical = text;

  // The voice is not one the speech model accepts (the first acceptance run: Ballad on tts-1-hd).
  if (/['"]voice['"]/.test(text) && /enum|Input should be|must be one of/i.test(text)) {
    return {
      kind: 'voice',
      title: "This voice isn't supported by the speech model",
      detail: 'Pick another voice, then retry this step. Nothing else needs to be redone.',
      fix: 'voice',
      technical,
    };
  }

  // A provider's own usage limit (not ours): nothing was lost, the step waits for the limit to return.
  if (/reached your specified|workspace api usage|usage limits?|insufficient_quota|exceeded your current quota/i.test(text)) {
    const when = returnDate(text);
    return {
      kind: 'provider_limit',
      title: `${providerName(text)} usage limit reached`,
      detail: `${when ? `Access returns on ${when}. ` : ''}Retry this step when the limit is raised or has returned. Everything made so far is kept.`,
      fix: null,
      technical,
    };
  }

  // Task 8: automatic retries have a spending allowance; past it the run waits for a person (Retry takes a higher limit).
  if (/^Automatic retry allowance used/i.test(text)) {
    return {
      kind: 'spend_limit',
      title: 'Automatic retries used up their spending allowance',
      detail: 'Retry with a higher spend limit to keep going. Nothing made so far is lost.',
      fix: 'limit',
      technical,
    };
  }

  // Our own spend limit for this video.
  const capped = typeof opts.spentUsd === 'number' && typeof opts.maxCostUsd === 'number' && opts.spentUsd >= opts.maxCostUsd;
  if (capped || /budget ceiling|spend limit|max(imum)? (spend|cost)/i.test(text)) {
    const title =
      typeof opts.spentUsd === 'number' && typeof opts.maxCostUsd === 'number'
        ? `This video used $${money(opts.spentUsd)} of its $${money(opts.maxCostUsd)} limit`
        : 'This video reached its spend limit';
    return { kind: 'spend_limit', title, detail: 'Raise the limit and retry. Nothing made so far is lost.', fix: 'limit', technical };
  }

  if (/regen cap|did not pass review|video review/i.test(text)) {
    const reason = opts.reviewReason ? shortSentence(opts.reviewReason, 160) : '';
    const tries = opts.tries ? ` after ${opts.tries} ${opts.tries === 1 ? 'try' : 'tries'}` : '';
    return {
      kind: 'video_review',
      title: `The video did not pass review${tries}`,
      detail: reason ? `Reviewer: ${reason}` : 'Retry, edit the settings, or cancel the run.',
      fix: null,
      technical,
    };
  }

  if (/^The YouTube connection/i.test(text)) {
    return { kind: 'youtube', title: 'The YouTube connection expired', detail: 'Reconnect the channel, then retry.', fix: null, technical };
  }

  if (!text) return { kind: 'other', title: 'Something went wrong', detail: null, fix: null, technical };
  return { kind: 'other', title: shortSentence(text, 120) || 'Something went wrong', detail: null, fix: null, technical };
}

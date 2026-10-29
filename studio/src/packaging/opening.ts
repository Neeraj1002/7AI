import { checkTitle, quoteInScript, wordCount } from './check';
import { coldRead as realColdRead, generateBrief as realGenerateBrief } from './generate';
import { FACE_RULE_TEXT, faceModeFor, renderScript, type ChannelLook } from './prompts';
import { scriptHashOf } from './build';
import { HOOK_MAX_CHARS, HOOK_MAX_WORDS } from './constants';
import type { CuriosityBrief } from './schemas';
import type { LLMResponse, RetryGuard } from '../llm';

// R7: the opening of a video built from the curiosity brief. For a Short: a hook line drawn on the first frame and a
// first picture that shows the one thing to look at. A Short has no Gate 2 choice before it is rendered (the video is
// the product there), so its single package is the brief's own question, hook line and frame-zero picture; the founder
// sees the result at Gate 2 and can Revise. Nothing here is channel-specific: the look and the title limit come only from the
// channel's own profile text, passed in.

// The question must be opened within this many seconds of narration (R7: five for a Short, ten for a long video).
export const OPEN_WITHIN_SECONDS = { short: 5, long: 10 } as const;
const WORDS_PER_MINUTE = { short: 150, long: 140 } as const;

export type ShortOpening = {
  scriptHash: string;
  // Null when no hook line passed the checks.
  hookLine: string | null;
  // Scene text for frame zero (before the channel's style and the safety clauses are added); null keeps the planner's own first picture.
  firstStillPrompt: string | null;
  question: string;
  device: string;
  answerQuote: string;
  // Why the hook line or the first picture was not used, in plain words.
  reasons: string[];
  // Advisory only: the question is not opened within the first seconds of narration.
  note: string | null;
  textCostUsd: number;
  builtAt: string;
  // The whole brief, so the record shows what was offered.
  brief: CuriosityBrief | null;
};

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'there', 'their', 'have', 'been', 'were', 'was', 'does', 'did', 'how', 'why', 'who', 'into', 'than', 'then', 'they', 'them', 'its', 'are', 'not', 'but', 'one']);
const contentWords = (text: string): string[] => [...new Set(text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))];

// The first `seconds` of narration, as the words that fit at the narration pace.
export function openingWords(scriptText: string, kind: 'short' | 'long', seconds = OPEN_WITHIN_SECONDS[kind]): string {
  const n = Math.round((WORDS_PER_MINUTE[kind] / 60) * seconds);
  return scriptText.trim().split(/\s+/).slice(0, n).join(' ');
}

// R7's advisory: is the question opened in the first seconds? Opened means the opening words share at least half of the
// question's content words, or contain a question mark and share one. Pure and cheap (no model call); it never enters a score
// and never triggers a retry.
export function questionOpenedWithin(scriptText: string, question: string, kind: 'short' | 'long'): boolean {
  const opening = openingWords(scriptText, kind);
  const wanted = contentWords(question);
  if (wanted.length === 0) return true;
  const have = new Set(contentWords(opening));
  const shared = wanted.filter((w) => have.has(w) || [...have].some((h) => h.length >= 5 && w.length >= 5 && (h.startsWith(w.slice(0, 5)) || w.startsWith(h.slice(0, 5))))).length;
  return shared >= Math.ceil(wanted.length / 2) || (opening.includes('?') && shared >= 1);
}

export function openingNote(scriptText: string, question: string, kind: 'short' | 'long'): string | null {
  if (questionOpenedWithin(scriptText, question, kind)) return null;
  return `The video does not open its question in the first ${OPEN_WITHIN_SECONDS[kind]} seconds ("${question.trim()}"). Advisory only.`;
}

const GENERIC = new Set(['sky', 'sea', 'light', 'shadow', 'background', 'foreground', 'scene', 'frame', 'figure', 'subject']);
// The picture named for frame zero must be something the script names: at least half of its distinctive words (five letters
// or more) appear in the script. Otherwise the planner's own first picture stays.
export function lookAtSupported(lookAt: string, scriptText: string): boolean {
  const words = contentWords(lookAt).filter((w) => w.length >= 5 && !GENERIC.has(w));
  if (words.length === 0) return false;
  const script = scriptText.toLowerCase();
  const found = words.filter((w) => script.includes(w.slice(0, Math.max(5, w.length - 2)))).length;
  return found >= Math.ceil(words.length / 2);
}

// The scene prompts of an ai-stills Short with frame zero swapped in: only the first picture changes.
export function applyFrameZero(planned: string[], first: string | null | undefined): string[] {
  return first && planned.length > 0 ? [first, ...planned.slice(1)] : planned;
}

export function frameZeroScene(brief: CuriosityBrief): string {
  return [
    `Vertical 9:16 opening image of one dominant subject: ${brief.lookAt}`,
    `What is at stake: ${brief.stake}`,
    'Strong directional light, the subject large in the lower two thirds of the frame, a calm darker area at the top where a line of text will be drawn',
    FACE_RULE_TEXT[faceModeFor(brief.subjectKind)],
  ].join('. ');
}

export type OpeningDeps = { generateBrief: typeof realGenerateBrief; coldRead: typeof realColdRead };
const REAL: OpeningDeps = { generateBrief: realGenerateBrief, coldRead: realColdRead };

const costOf = (calls: LLMResponse[]) => calls.reduce((s, c) => s + Number(c.costUsd) + (c.priorAttempts ?? []).reduce((a, p) => a + Number(p.costUsd), 0), 0);

export async function buildShortOpening(params: {
  scriptText: string;
  briefText?: string | null;
  look: ChannelLook;
  retryGuard?: RetryGuard;
  // Every billed call, booked by the caller as usage rows.
  onText: (label: 'brief' | 'cold-reader', calls: LLMResponse[]) => Promise<void>;
  deps?: OpeningDeps;
  now?: Date;
}): Promise<ShortOpening> {
  const deps = params.deps ?? REAL;
  const scriptHash = scriptHashOf(params.scriptText, params.look);
  const made = await deps.generateBrief({ renderedScript: renderScript(params.scriptText), scriptText: params.scriptText, look: params.look, retryGuard: params.retryGuard });
  await params.onText('brief', made.calls);
  let textCostUsd = costOf(made.calls);
  const brief = made.brief;
  const base = { scriptHash, textCostUsd, builtAt: (params.now ?? new Date()).toISOString(), brief, device: brief.primaryDevice, answerQuote: brief.answeredIn.quote, question: brief.question };
  if (brief.weakGap) {
    return { ...base, hookLine: null, firstStillPrompt: null, reasons: [`No honest gap in the script: ${brief.weakGap}`], note: null };
  }
  const reasons: string[] = [];

  // The hook line: short, honest, withholding the answer. Checked, never repaired.
  let hookLine: string | null = (brief.hookLine ?? '').trim().replace(/\s+/g, ' ') || null;
  if (hookLine) {
    const issues = [
      ...(wordCount(hookLine) > HOOK_MAX_WORDS ? [`The hook line is ${wordCount(hookLine)} words; the limit is ${HOOK_MAX_WORDS}.`] : []),
      ...checkTitle({ title: hookLine, scriptText: params.scriptText, briefText: params.briefText, brief, titleLimit: HOOK_MAX_CHARS }).map((i) => i.message),
      ...(!quoteInScript(params.scriptText, brief.answeredIn.quote) ? ['The place the script answers the question is not a quotation from the script.'] : []),
    ];
    if (issues.length > 0) {
      reasons.push(...issues.map((m) => `Hook line dropped: ${m}`));
      hookLine = null;
    }
  } else {
    reasons.push('The brief gave no hook line.');
  }
  if (hookLine) {
    const read = await deps.coldRead({ items: [{ index: 0, title: hookLine, lettering: '' }], retryGuard: params.retryGuard });
    await params.onText('cold-reader', [read.llm]);
    textCostUsd += costOf([read.llm]);
    if (read.value.reads.find((r) => r.index === 0)?.answerGivenAway) {
      reasons.push('Hook line dropped: it already gives away the answer.');
      hookLine = null;
    }
  }

  // Frame zero: the brief's one thing to look at, only when the script names it.
  let firstStillPrompt: string | null = null;
  if (lookAtSupported(brief.lookAt, params.scriptText)) firstStillPrompt = frameZeroScene(brief);
  else reasons.push("The picture the brief names for frame zero is not something the script names, so the planner's own first picture stays.");

  return { ...base, textCostUsd, hookLine, firstStillPrompt, reasons, note: openingNote(params.scriptText, brief.question, 'short') };
}

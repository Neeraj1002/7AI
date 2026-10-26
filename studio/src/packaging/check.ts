import { checkMetadataClaims } from '../agents/publishing/metadata-claims';
import { LETTERING_MAX_WORDS, NEUTRAL_TITLE_LIMIT, SUBLINE_MAX_WORDS, TITLE_MAX_CHARS } from './constants';
import type { Concept, CuriosityBrief } from './schemas';

// R2: everything about a concept that code can check, checked in code. A concept that fails is dropped with its
// reasons, never repaired silently. The spike found the model broke its own limits in 2 of 18 packages and
// dropped hedges from figures, so none of this is left to the prompt.

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

// True when the quote, after dropping case, punctuation and spacing, is a stretch of the script.
export function quoteInScript(scriptText: string, quote: string): boolean {
  const q = normalise(quote);
  if (q.split(' ').filter(Boolean).length < 3) return false;
  return ` ${normalise(scriptText)} `.includes(` ${q} `);
}

// A channel's title guidance states its limit in words ("never over 60", "35 to 55 characters"). The one place
// that reads it. No guidance means the neutral limit; guidance without a number means YouTube's own limit.
export function parseTitleLimit(guidance: string | null | undefined): number {
  if (!guidance) return NEUTRAL_TITLE_LIMIT;
  const found: number[] = [];
  for (const m of guidance.matchAll(/(?:never over|not over|at most|no more than|up to|under|max(?:imum)?(?: of)?)\s+(\d{2,3})\s*(?:characters|chars)?/gi)) found.push(Number(m[1]));
  for (const m of guidance.matchAll(/\b(\d{2,3})\s*(?:to|-|–)\s*(\d{2,3})\s*characters/gi)) found.push(Number(m[2]));
  const usable = found.filter((n) => n >= 20 && n <= TITLE_MAX_CHARS);
  return usable.length > 0 ? Math.max(...usable) : TITLE_MAX_CHARS;
}

// Words that promise a hidden or corrected truth. Allowed only when the script itself states the popular version
// and then the documented record (the brief's `correction`, with its quote found in the script).
const EARNED_WORDS = /\b(untold|what really happened|really happened|the real story|the truth|secrets?|secretly|banned|forbidden|suppressed|censored|cover[- ]?up|hidden truth|they don'?t want you to know)\b/i;
// Labels no video of ours can truthfully carry.
const BADGES = /\b(4k|8k|uhd|hd|full movie|full film|full episode|short movie|official|exclusive|leaked)\b/i;

export function correctionEarned(brief: CuriosityBrief | null, scriptText: string): boolean {
  return Boolean(brief?.correction && quoteInScript(scriptText, brief.correction.quote));
}

export type ConceptIssue = { code: string; message: string };

// PR B: a prop the concept lists that the script never names is no longer a reason to drop the concept (live runs: it
// dropped six of six Ada concepts for a desk and a pen). It is a hint to the payoff check, which looks at the real
// picture and decides. This function stays as the one rule for "named by the script".

// Scenery and light that every picture has; a prop on this list needs no mention in the script.
const GENERIC_SCENERY = new Set(['sky', 'sea', 'ocean', 'water', 'waves', 'wave', 'ground', 'floor', 'light', 'shadow', 'shadows', 'haze', 'fog', 'mist', 'cloud', 'clouds', 'horizon', 'sun', 'sunset', 'sunrise', 'smoke', 'dust', 'rain', 'snow', 'wall', 'walls', 'shore', 'sand', 'grass', 'silhouette', 'background', 'foreground']);

// A prop is supported when its last word (its head noun), or another word of it five letters or longer, appears in
// the script, allowing a plural or a short ending. So "calendar page" passes when the script says calendar, and
// "wooden toy" is refused when the script never says wooden or toy.
export function unsupportedProps(props: string[], scriptText: string): string[] {
  const scriptWords = normalise(scriptText).split(' ').filter(Boolean);
  return props.filter((raw) => {
    const words = normalise(raw).split(' ').filter(Boolean);
    const head = words[words.length - 1];
    if (!head || GENERIC_SCENERY.has(head)) return false;
    const stemOf = (word: string) => (word.length > 4 ? word.replace(/(ies|es|s)$/, '') : word.replace(/s$/, ''));
    const inScript = (word: string) => scriptWords.some((w) => w.startsWith(stemOf(word)) && w.length - stemOf(word).length <= 3);
    return !(inScript(head) || words.slice(0, -1).some((w) => w.length >= 5 && !GENERIC_SCENERY.has(w) && inScript(w)));
  });
}

// The checks a title alone can fail, shared by a concept (above) and a title the founder edits at Gate 2: length,
// fake badges, words that promise a hidden truth, and figures or hedges the script does not support.
export function checkTitle(params: {
  title: string;
  scriptText: string;
  briefText?: string | null;
  brief: CuriosityBrief | null;
  titleLimit: number;
  // Words shown with the title on the thumbnail, checked the same way.
  alsoShown?: string;
}): ConceptIssue[] {
  const issues: ConceptIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const title = params.title.trim();
  const shown = `${title} ${params.alsoShown ?? ''}`;
  if (!title) add('title_empty', 'The title is empty.');
  if (title.length > params.titleLimit) add('title_too_long', `The title is ${title.length} characters; this channel's limit is ${params.titleLimit}.`);
  const badge = BADGES.exec(shown);
  if (badge) add('badge', `"${badge[0]}" is a label that is not true of this video.`);
  const word = EARNED_WORDS.exec(shown);
  if (word && !correctionEarned(params.brief, params.scriptText)) {
    add('unearned_word', `"${word[0]}" promises a hidden or corrected truth, but the script does not state a popular version and then the record.`);
  }
  const claims = checkMetadataClaims({
    scriptText: params.scriptText,
    briefText: params.briefText,
    metadata: { title, description: params.alsoShown?.trim() || title, tags: [] },
  });
  for (const c of claims) add(c.code, c.message);
  return issues;
}

export function validateConcept(params: {
  concept: Concept;
  scriptText: string;
  briefText?: string | null;
  brief: CuriosityBrief;
  titleLimit: number;
}): ConceptIssue[] {
  const { concept, scriptText, briefText, brief, titleLimit } = params;
  const issues: ConceptIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const title = concept.title.trim();
  const { words, subline } = concept.thumbnail.lettering;
  // Sentences, so a number at the end of the lettering is not read as part of the subline's first words.
  const lettered = [words, subline].filter(Boolean).map((t) => `${t!.trim().replace(/[.!?]+$/, '')}.`).join(' ');

  issues.push(...checkTitle({ title, scriptText, briefText, brief, titleLimit, alsoShown: lettered }));
  if (wordCount(words) < 1) add('lettering_empty', 'The thumbnail has no lettering.');
  if (wordCount(words) > LETTERING_MAX_WORDS) add('lettering_words', `The lettering is ${wordCount(words)} words; the limit is ${LETTERING_MAX_WORDS}.`);
  if (subline && wordCount(subline) > SUBLINE_MAX_WORDS) add('subline_words', `The subline is ${wordCount(subline)} words; the limit is ${SUBLINE_MAX_WORDS}.`);

  // The thumbnail names the world; the title asks the question. They must not repeat each other.
  if (wordCount(words) >= 2 && normalise(title).includes(normalise(words))) {
    add('repeats_title', 'The lettering repeats the title word for word.');
  }

  if (!quoteInScript(scriptText, concept.answeredIn.quote)) {
    add('answer_not_in_script', 'The place the question is answered is not a quotation from the approved script.');
  }
  if (!quoteInScript(scriptText, concept.supportQuote)) {
    add('support_not_in_script', 'The phrase said to support the picture is not in the approved script.');
  }

  for (const person of concept.namedPeople) {
    if (person.livingOrUnknown) add('living_person', `${person.name} may be a living person; real living people are not depicted or named in a package.`);
    else if (!normalise(scriptText).includes(normalise(person.name))) add('person_not_in_script', `${person.name} is not named in the approved script.`);
  }
  return issues;
}

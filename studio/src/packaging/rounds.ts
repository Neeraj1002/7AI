import type { Dropped } from './select';

// R10: when every package of the first round is dropped, the concepts call is made once more with the RULES the
// drops broke fed back, so the model writes different concepts. Hard rules for this file:
// - Only a rule name and a short fixed sentence written here reach the model, with a count. Never a dropped title,
//   lettering, object or reason text: the reasons contain the very thing that was wrong (an invented object, a figure
//   the script does not state) and the model must not be able to copy it.
// - Nothing here relaxes a check. The second round runs the same code checks, the same cold reader and the same picture
//   checks as the first.
// - Nothing channel-specific.

export const MAX_EXTRA_ROUNDS = 1;

// Code-check rule names are the codes of check.ts (`ConceptIssue.code`) and of metadata-claims; the others are named in
// build.ts and vision.ts. A rule that is not listed here is passed on by name with a generic sentence.
const ADVICE: Record<string, string> = {
  title_empty: 'Every concept needs a title.',
  title_too_long: 'Keep each title within the length limit given above.',
  lettering_empty: 'Every thumbnail needs its large lettering.',
  lettering_words: 'Keep the large lettering to four words or fewer.',
  subline_words: 'Keep the small subline to five words or fewer.',
  badge: 'Do not use labels such as 4K, HD, Full Movie or Official.',
  unearned_word: 'Do not use words such as untold, secret, banned or what really happened unless the brief has a correction quote.',
  repeats_title: 'The large lettering must not repeat the title.',
  unsupported_number: 'Use only figures and dates that the script states exactly.',
  hedge_dropped: 'Keep hedge words (about, roughly, almost, by sales) on any figure the script hedges.',
  answer_not_in_script: 'Copy the answer quote exactly from the script.',
  support_not_in_script: 'Copy the supporting phrase for the picture exactly from the script.',
  living_person: 'Do not name or show a real person who may be alive.',
  person_not_in_script: 'Name only people the script names.',
  answer_given_away: 'The title must not state the answer to the question it raises.',
  lettering_unreadable: 'Use short lettering that stays readable at small sizes.',
  lettering_covers_subject: 'Describe a composition with a calm area for the lettering that is away from any face or main subject.',
  picture_title_mismatch: 'The picture and the title must give one idea without the script.',
  scene_not_in_script: 'Show only scenes, people and objects that the script names or clearly depicts; add no invented props.',
  picture_contradicts_words: 'The picture must not contradict its own words or the script.',
  question_unanswered: 'Raise only a question the script actually answers.',
  answer_quote_not_in_script: 'Copy the answer quote exactly from the script.',
  answer_does_not_pay_off: 'The script answer must really pay off the curiosity the title raises.',
  fake_label_or_unearned_word: 'Do not use labels or words the script does not earn.',
  image_refused: 'Choose a picture the image provider will accept.',
};

// A drop that is not a broken rule (a concept merely ranked below the three kept) is not feedback.
const NOT_A_FAILURE = new Set(['ranked_below_kept']);

export type RuleCount = { rule: string; count: number };

export function ruleCounts(dropped: Dropped[]): RuleCount[] {
  const counts = new Map<string, number>();
  for (const d of dropped) {
    for (const rule of d.rules ?? []) {
      if (NOT_A_FAILURE.has(rule)) continue;
      counts.set(rule, (counts.get(rule) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
}

// The lines the second concepts call is given, and the lines recorded with the round.
export function feedbackFromDrops(dropped: Dropped[]): string[] {
  return ruleCounts(dropped).map(({ rule, count }) => `${rule} (${count}): ${ADVICE[rule] ?? 'Avoid breaking this rule.'}`);
}

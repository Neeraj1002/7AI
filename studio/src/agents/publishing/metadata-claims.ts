import { numericVerdicts } from '../script-review/numbers';

// Sprint 5 Task 8 (R11.6): the generated title, description and tags get the number rules Script Review applies to
// the script (Sprint 5 Task 6, merged): a figure must match the approved script or the brief after normalisation
// (SR-1), and a figure the source hedges keeps a hedge in the same sentence (SR-8). The rules live in ONE place,
// script-review/numbers.ts (`numericVerdicts`); this file only feeds it the metadata and turns its verdicts into the
// issues the publishing stage uses. There is no second copy of the rule.
//
// One thing is done here and is not Task 6's rule: a title written as "$220M" or "1.4B" is spelled out ("$220
// million", "1.4 billion") before it is handed over, because numericVerdicts reads words and plain digits and does
// not see a figure with a letter stuck to it, so an abbreviation would pass unchecked.

export type ClaimIssue = {
  code: 'unsupported_number' | 'hedge_dropped';
  where: 'title' | 'description' | 'tags';
  figure: string;
  message: string;
  // Every verdict of the shared rule holds the publish (one regeneration first).
  holds: true;
};

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/(\d(?:[\d,]*(?:\.\d+)?))\s?(?:bn|b)\b/gi, '$1 billion'],
  [/(\d(?:[\d,]*(?:\.\d+)?))\s?(?:mn|m)\b/gi, '$1 million'],
  [/(\d(?:[\d,]*(?:\.\d+)?))\s?k\b/gi, '$1 thousand'],
];

export function spellOutAbbreviations(text: string): string {
  return ABBREVIATIONS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

function quotedFigure(verdict: string): string {
  const match = verdict.match(/(?:unmatched number|dropped numeric hedge for) ("(?:[^"\\]|\\.)*")/);
  if (!match) return '';
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return match[1];
  }
}

export function checkMetadataClaims(params: {
  scriptText: string;
  briefText?: string | null;
  metadata: { title: string; description: string; tags: string[] };
}): ClaimIssue[] {
  // The source of truth for a figure is what the person approved (the script) and what the brief states.
  const source = [params.briefText ?? '', params.scriptText].filter(Boolean).join('\n');
  const parts: Array<['title' | 'description' | 'tags', string]> = [
    ['title', params.metadata.title],
    ['description', params.metadata.description],
    // Each tag is its own sentence, so a tag cannot borrow a hedge from the one before it.
    ['tags', params.metadata.tags.map((t) => `${t}.`).join(' ')],
  ];
  const issues: ClaimIssue[] = [];
  for (const [where, text] of parts) {
    const { violations } = numericVerdicts(source, spellOutAbbreviations(text));
    for (const verdict of violations) {
      const dropped = verdict.startsWith('SR-8');
      const figure = quotedFigure(verdict);
      issues.push({
        code: dropped ? 'hedge_dropped' : 'unsupported_number',
        where,
        figure,
        holds: true,
        message: dropped
          ? `The ${where} states "${figure}" without the hedge the approved script gives it (${verdict}).`
          : `The ${where} states "${figure}", which is not in the approved script or the brief (${verdict}).`,
      });
    }
  }
  return issues;
}

export const holdingIssues = (issues: ClaimIssue[]) => issues.filter((i) => i.holds);

// The instruction for the one regeneration, and the message when the second attempt fails too.
export function describeClaimIssues(issues: ClaimIssue[]): string {
  return issues.map((i) => i.message).join(' ');
}

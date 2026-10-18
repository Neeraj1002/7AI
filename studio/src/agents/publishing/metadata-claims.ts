// Sprint 5 Task 8 (R11.6): the title, description and tags are generated after Script Review, so nothing
// checked them. The Lego title "How Lego Turned Around Its $220M Crisis" dropped "roughly" from "roughly 220
// million dollars". This applies the same two code-level rules Script Review applies to the script (Sprint 5
// Task 6, R2) to what goes on YouTube:
//   1. a figure with a magnitude, a currency or a percent sign must appear in the approved script or the brief
//      (after normalising "220 million", "$220M" and "220,000,000" to one number);
//   2. a figure the script hedges ("roughly", "about", "almost", "more than"...) must keep a hedge where the
//      title or description repeats it.
// Years and small plain counts are reported as warnings only; they never hold a publish.
//
// SINGLE PLACE: Task 6 owns the number rules (studio/src/agents/script-review/numbers.ts, PR #105). When that
// merges, replace `figuresIn`/`HEDGES` below with its exports; this file's `checkMetadataClaims` stays the one
// entry the publishing stage calls. Until then this is a deliberate, small copy, flagged in the Task 8 report.

export const HEDGES = [
  'about', 'around', 'roughly', 'approximately', 'almost', 'nearly', 'estimated', 'some',
  'more than', 'over', 'at least', 'at most', 'up to', 'close to', 'largely', 'mostly',
] as const;

const MAGNITUDE: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, millions: 1e6, b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9,
  t: 1e12, trillion: 1e12,
};

export type Figure = {
  value: number;
  raw: string;
  // 'strong' figures can hold a publish; 'weak' ones (years, small counts) only warn.
  strength: 'strong' | 'weak';
  // The hedge word found just before the figure, or null.
  hedge: string | null;
  kind: 'currency' | 'percent' | 'magnitude' | 'plain';
};

const NUMBER = /(?<currency>[$€£¥])?\s?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?<unit>%|percent|per cent|thousand|millions?|billions?|trillion|bn|mn|[kmbt]\b)?/gi;

function hedgeBefore(text: string, index: number): string | null {
  const before = text.slice(Math.max(0, index - 24), index).toLowerCase();
  // Longest hedge first so "more than" wins over "than".
  for (const hedge of [...HEDGES].sort((a, b) => b.length - a.length)) {
    // The hedge must sit directly before the figure ("roughly 220 million"), so "Turned Around Its $220M" is not hedged.
    if (new RegExp(`(?:^|[^a-z])${hedge}\\s*$`).test(before)) return hedge;
  }
  return null;
}

export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const groups = match.groups ?? {};
    let value = Number(String(groups.num).replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const unit = (groups.unit ?? '').toLowerCase();
    const isPercent = unit === '%' || unit === 'percent' || unit === 'per cent';
    const mult = MAGNITUDE[unit];
    if (mult) value *= mult;
    const kind: Figure['kind'] = groups.currency ? 'currency' : isPercent ? 'percent' : mult ? 'magnitude' : 'plain';
    const looksLikeYear = kind === 'plain' && Number.isInteger(value) && value >= 1000 && value <= 2200 && !/,/.test(String(groups.num));
    out.push({
      value,
      raw: match[0].trim(),
      strength: kind !== 'plain' || (value >= 10_000 && !looksLikeYear) ? 'strong' : 'weak',
      hedge: hedgeBefore(text, match.index ?? 0),
      kind: isPercent && kind !== 'currency' ? 'percent' : kind,
    });
  }
  return out;
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);

export type ClaimIssue = {
  code: 'unsupported_number' | 'hedge_dropped';
  where: 'title' | 'description' | 'tags';
  figure: string;
  message: string;
  // true = holds the publish; false = a warning recorded for the person.
  holds: boolean;
};

export function checkMetadataClaims(params: {
  scriptText: string;
  briefText?: string | null;
  metadata: { title: string; description: string; tags: string[] };
}): ClaimIssue[] {
  const allowed = [...figuresIn(params.scriptText), ...figuresIn(params.briefText ?? '')];
  const hedgedInSource = (value: number) => {
    const matches = allowed.filter((f) => same(f.value, value));
    // Hedged when every place the source states it is hedged (a plain statement elsewhere means it is exact).
    return matches.length > 0 && matches.every((f) => f.hedge !== null) ? matches.find((f) => f.hedge)?.hedge ?? null : null;
  };
  const issues: ClaimIssue[] = [];
  const parts: Array<['title' | 'description' | 'tags', string]> = [
    ['title', params.metadata.title],
    ['description', params.metadata.description],
    ['tags', params.metadata.tags.join(', ')],
  ];
  for (const [where, text] of parts) {
    for (const figure of figuresIn(text)) {
      const supported = allowed.some((f) => same(f.value, figure.value));
      if (!supported) {
        issues.push({
          code: 'unsupported_number',
          where,
          figure: figure.raw,
          holds: figure.strength === 'strong',
          message: `The ${where} states "${figure.raw}", which is not in the approved script or the brief.`,
        });
        continue;
      }
      const hedge = hedgedInSource(figure.value);
      if (hedge && !figure.hedge && figure.strength === 'strong') {
        issues.push({
          code: 'hedge_dropped',
          where,
          figure: figure.raw,
          holds: true,
          message: `The ${where} states "${figure.raw}" without a hedge, but the script says "${hedge} ${figure.raw}". Keep a hedge such as "${hedge}".`,
        });
      }
    }
  }
  return issues;
}

export const holdingIssues = (issues: ClaimIssue[]) => issues.filter((i) => i.holds);

// The instruction for the one regeneration, and the message when the second attempt fails too.
export function describeClaimIssues(issues: ClaimIssue[]): string {
  return issues.map((i) => i.message).join(' ');
}

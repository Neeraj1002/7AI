import { numberMentions, numericVerdicts, sentenceSpans, numericSourceText } from './numbers';
/** Candidate extraction only: no candidate becomes a factual verdict without review. */
export type BriefHint = { id: string; kind: 'number' | 'name' | 'absolute' | 'hedge' | 'required-term' | 'conversion' | 'detail' | 'arithmetic'; text: string; evidence?: string };
export type BriefChecks = { hints: BriefHint[]; exactViolations: string[]; supportedNumericValues: number[]; numericViolations: string[] };
export function normalizedNumbers(text: string): number[] { return numberMentions(text).map(n => n.value); }
const quoted = (text: string) => [...text.matchAll(/[\u201c\u201d"]([^\u201c\u201d"]+)[\u201c\u201d"]/g)].map(m => m[1]);
const sentences = (text: string) => sentenceSpans(text).map(s => s.text);
const terms = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const hedges = ['about', 'around', 'largely', 'mostly', 'estimates', 'estimated', 'at most', 'only a handful', 'more than', 'over', 'did not fall as'];
export function checkBrief(brief: string, script: string): BriefChecks {
  const hints: BriefHint[] = [], exactViolations: string[] = [];
  const add = (kind: BriefHint['kind'], text: string, evidence?: string) => {
    if (hints.length < 96 && !hints.some(h => h.kind === kind && h.text === text && h.evidence === evidence))
      hints.push({ id: 'H' + (hints.length + 1), kind, text, ...(evidence && { evidence }) });
  };
  const lowerBrief = brief.toLowerCase();
  const briefNumbers = new Set(normalizedNumbers(numericSourceText(brief)));
  const numericChecks = numericVerdicts(brief, script);
  for (const text of numericChecks.derivedHints) add('arithmetic', text, 'Derived arithmetic: confirm relationship; no automatic factual verdict.');
  const common = new Set('A An The This That These Those It In At On So But And For As Of To By Today People They He She We You There What How When Why From With'.split(' '));
  for (const match of script.matchAll(/\b[A-Z][a-z]+(?:[ -]+[A-Z][a-z]+)*\b/g)) {
    const name = match[0].split(' ').filter(w => !common.has(w)).join(' ');
    if (name && !lowerBrief.includes(name.toLowerCase())) add('name', name);
  }
  for (const match of script.matchAll(/\b(?:none|all|always|never|every|nobody|entire|completely)\b/gi))
    if (!new RegExp('\\b' + match[0] + '\\b', 'i').test(brief)) add('absolute', match[0]);
  for (const sentence of sentences(brief)) {
    const present = hedges.filter(h => new RegExp('\\b' + h + '\\b', 'i').test(sentence));
    if (!present.length) continue;
    const keys = terms(sentence);
    const ranked = sentences(script).map(s => ({ s, overlap: [...terms(s)].filter(t => keys.has(t)).length })).sort((a, b) => b.overlap - a.overlap);
    const candidate = ranked[0];
    if (candidate && candidate.overlap >= 2) for (const hedge of present)
      if (!new RegExp('\\b' + hedge + '\\b', 'i').test(candidate.s)) add('hedge', candidate.s.trim(), sentence.trim());
  }
  // Quoted passages can contain multiple sentences (including the founder's Appendix A opening).
  for (const match of brief.matchAll(/\b(first|last) sentence\s+(?:must be\s+)?exactly\s*:?\s*[\u201c\u201d"]([^\u201c\u201d"]+)[\u201c\u201d"]/gi)) {
    const ok = match[1].toLowerCase() === 'first' ? script.trimStart().startsWith(match[2]) : script.trimEnd().endsWith(match[2]);
    if (!ok) exactViolations.push('SR-2: ' + match[1].toLowerCase() + ' sentence must be exactly ' + JSON.stringify(match[2]));
  }
  for (const match of brief.matchAll(/(?:use these\s+)?exact hedge words\s*:?\s*([^;\n]+)/gi))
    for (const hedge of quoted(match[1])) if (!script.includes(hedge)) exactViolations.push('SR-2: missing exact hedge words ' + JSON.stringify(hedge));
  // These additional lexical cues surface lowercase inventions and ambiguous money prose.
  // They deliberately remain hints: synonyms, valid arithmetic and ordinary transitions can be innocent.
  for (const match of brief.matchAll(/the word\s+["\u201c]([^"\u201d]+)["\u201d]/gi))
    if (!script.toLowerCase().includes(match[1].toLowerCase())) add('required-term', 'Required key term absent: ' + match[1], match[0]);
  const stop = new Set('about around almost along again after before between could would should their these those there where which while through because became become being every never other still first later today words story account question answer things something instead means meant simply given gives facts brief itself itself script exact people workers work years'.split(' '));
  const briefTerms = terms(brief);
  for (const sentence of sentences(script)) {
    if (/\bworth\b/i.test(sentence) && /\$|dollars?\b/i.test(sentence))
      add('conversion', sentence.trim(), 'Check SR-7: is this explicitly a labour convention, or stated as intrinsic coin/object value?');
    if (sentence.includes('?')) continue;
    const novel = [...terms(sentence)].filter(t => !briefTerms.has(t) && !stop.has(t));
    if (novel.length >= 3 || /\b(?:sold|kept|wore|happening|torn|earned)\b/i.test(sentence) && novel.length >= 1)
      add('detail', sentence.trim(), 'Unmatched content terms (not proof of invention): ' + novel.join(', '));
  }
  return { hints, exactViolations, numericViolations: numericChecks.violations, supportedNumericValues: [...new Set(normalizedNumbers(script).filter(n => briefNumbers.has(n)))] };

}

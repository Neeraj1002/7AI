import { scenePropStatus } from './scene-props';
import { numberMentions } from './numbers';
/** Reject only narrowly provable model-invented requirements; never infer semantic permission. */
import type { ScriptReviewOutput } from './index';
const quoted = (s: string) => [...s.matchAll(/["\u201c]([^"\u201d]+)["\u201d]|(?<!\w)'([^'\n]+)'(?!\w)/g)].map(m => m[1] ?? m[2]);
const normalized = (s: string) => s.toLowerCase().replace(/[.!?]+$/g, '').trim();

export function unsupportedDocumentedCoverage(brief: string, finding: string): boolean {
  // A category label establishes admissibility, not a requirement to narrate every item.
  // Keep uncertain, mixed and explicit-coverage findings: they still need a model/owner decision.
  if (!/DOCUMENTED:/i.test(brief) || !/IMAGINED:/i.test(brief)) return false;
  if (/\b(include|mention|cover|state|say|must|required?|each fact|every fact|all (?:the )?facts)\b/i.test(brief)) return false;
  if (!/^SR-2:\s*(?:The )?documented (?:facts?|cubical stone weights|core)\b/i.test(finding)) return false;
  if (!/\b(missing|omitted|absent)\b/i.test(finding)) return false;
  if (/\b(length|seconds?|words?|chapters?|opening|closing|hedges?|dialogue|speech|names?|prices?|dates?|spelling|order|wrong|incorrect|changed|unsupported|invented|not in brief)\b/i.test(finding)) return false;
  // Restrict this correction to the supplied DOCUMENTED vocabulary, not arbitrary omitted content.
  const documented = brief.match(/DOCUMENTED:([\s\S]*?)(?=\b(?:INFERRED|COMMENTARY-ONLY|IMAGINED):|$)/i)?.[1] ?? '';
  const claim = finding.replace(/^SR-2:/i, '').split(/;|\.\s+(?:Add|Include|Restore)/i)[0];
  const boilerplate = new Set('the documented facts fact core are is missing omitted absent and for of larger ones a'.split(' '));
  if (numberMentions(claim).some(n => !numberMentions(documented).some(d => d.value === n.value))) return false;
  const terms = claim.toLowerCase().match(/[a-z]+/g) ?? [];
  const sourceTerms = new Set(documented.toLowerCase().match(/[a-z]+/g) ?? []);
  return terms.some(t => sourceTerms.has(t) && !boilerplate.has(t)) && terms.every(t => boilerplate.has(t) || sourceTerms.has(t));
}

export function explicitlyAllowedRhetoric(brief: string, script: string, finding: string): boolean {
  if (!/^SR-9:/i.test(finding) || !/not in (?:the )?brief|unsupported|invent/i.test(finding)) return false;
  if (!/^SR-9:\s*(?:"[^"]+"|'[^']+'|\u201c[^\u201d]+\u201d)\s+(?:is|are)\s+(?:an? )?(?:unsupported|invented|not in (?:the )?brief)(?: (?:claim|fact|event))?[.;]?(?:\s*(?:Remove|Delete) (?:it|this sentence|this line)\.)?$/i.test(finding)) return false;
  const clause = brief.match(/(?:harmless )?rhetorical transitions are allowed:([^\n]+?)(?=\.\s+[A-Z]|$)/i)?.[1];
  if (!clause) return false;
  const allowed = quoted(clause).map(normalized), claims = quoted(finding);
  // All quoted claims must be whole, expressly permitted rhetoric present in this script.
  return claims.length > 0 && claims.every(c => allowed.includes(normalized(c)) && normalized(script).includes(normalized(c)));
}

export function groundModelFindings(output: ScriptReviewOutput, brief: string, script: string): ScriptReviewOutput {
  const dismissed: string[] = [];
  const filter = (findings: string[]) => findings.filter(f => {
    const reason = scenePropStatus(brief, script, f) === 'listed' ? 'the IMAGINED scene-props line expressly lists this prop' : unsupportedDocumentedCoverage(brief, f) ? 'DOCUMENTED is an allowed evidence set, without an explicit all-facts coverage requirement' : explicitlyAllowedRhetoric(brief, script, f) ? 'the brief expressly permits this exact rhetorical line' : null;
    if (!reason) return true;
    dismissed.push('Reviewer correction (advisory, no new cap): ' + reason + '. Original finding: ' + f);
    return false;
  });
  const factualConcerns = filter(output.factualConcerns), styleGuideViolations = filter(output.styleGuideViolations);
  // Never raise a model score: a new source-matched review is needed to reassess a false deduction.
  return { ...output, factualConcerns, styleGuideViolations, notes: [output.notes, ...dismissed].join('\n') };
}

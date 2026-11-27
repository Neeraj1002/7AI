import type { ScriptReviewOutput } from './index';
export { reviewRules } from '../../prompts/system-prompts';

/** Reuses existing fields; candidates alone never enter this function. */
export function calibrateReview(output: ScriptReviewOutput, exactViolations: string[], briefOnly: boolean, softSceneProp: (finding: string) => boolean = () => false, confirmedHardCaps?: ReadonlySet<string>): ScriptReviewOutput {
  const factualConcerns: string[] = [], styleGuideViolations: string[] = [], advisory: string[] = [];
  const findings: { rule: number; text: string }[] = [];
  for (const [list, fallback] of [[output.factualConcerns, 1], [output.styleGuideViolations, 2]] as const) {
    for (const text of list) {
      const rule = Number(text.match(/^\s*\[?SR-([1-9])\b/i)?.[1] ?? fallback);
      if ([3, 4, 5].includes(rule)) { advisory.push(text); continue; }
      (rule === 2 ? styleGuideViolations : factualConcerns).push(text);
      findings.push({ rule, text });
    }
  }
  for (const text of exactViolations) if (![...styleGuideViolations, ...factualConcerns].includes(text)) { const rule = Number(text.match(/^SR-([1-9]):/)?.[1] ?? 2); (rule === 2 ? styleGuideViolations : factualConcerns).push(text); findings.push({ rule, text }); }
  let score = output.score;
  const reasons: string[] = [];
  for (const { rule, text } of findings) {
    const hard = rule === 1 || (rule === 9 && briefOnly && !softSceneProp(text));
    // With a confirmation step, only a model finding confirmed unsupported (or one code computed itself) may cap at 6.
    const unconfirmed = hard && confirmedHardCaps !== undefined && !confirmedHardCaps.has(text) && !exactViolations.includes(text);
    const cap = hard && !unconfirmed ? 6 : 8;
    if (output.score > cap) reasons.push('capped at ' + cap + (unconfirmed ? ' (hard cap of 6 not applied: not confirmed unsupported by the brief facts)' : '') + ': ' + text);
    score = Math.min(score, cap);
  }
  return { ...output, score, factualConcerns, styleGuideViolations,
    notes: [output.notes, ...advisory, ...reasons].join('\n') };
}

/** Only the auto-reject log feeds the writer; Gate 1 already renders the arrays separately. */
export function scriptRetryFeedback(output: ScriptReviewOutput): string {
  return [output.notes, ...output.factualConcerns, ...output.styleGuideViolations].join('\n');
}

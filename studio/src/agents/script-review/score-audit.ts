import { z } from 'zod';
import type { ScriptReviewOutput } from './index';

const RuleSchema = z.enum(['SR-1','SR-2','SR-3','SR-4','SR-5','SR-7','SR-8','SR-9']);
const CriterionSchema = z.enum(['chapter-order','open-loop','factual-causality','brief-brand','hook-promise']);
const RubricSubscoreSchema = z.object({ criterion: CriterionSchema, score: z.number().min(0).max(10), finding: z.string().nullable() });
export const ScoreAuditSchema = z.object({
  rubricSubscores: z.array(RubricSubscoreSchema).length(5),
  findings: z.array(z.object({ rule: RuleSchema, finding: z.string().min(1) })),
});
export type ScoreAudit = z.infer<typeof ScoreAuditSchema>;
const LegacyRubricDeductionSchema=z.object({criterion:CriterionSchema,points:z.number().min(0).max(10),finding:z.string().min(1)});
export const LegacyScoreAuditSchema=z.object({rubricScore:z.number().min(0).max(10),rubricDeductions:z.array(LegacyRubricDeductionSchema).optional(),deductions:z.array(z.object({rule:RuleSchema,points:z.number().min(0).max(10),finding:z.string().min(1)}))});
export type LegacyScoreAudit=z.infer<typeof LegacyScoreAuditSchema>;
const advisory=/\b(?:SR-[345]|repetit(?:ion|ive)|filler|padding|padded|awkward|pronunciat\w*|meta.commentary|thin visuals?|flatness|static visuals?|recap|restate|scene.based|scene detail|narrat(?:ive|ing)|lack(?:s|ing)? (?:of )?(?:tension|drama))\b/i;

/** The model supplies evidence and five bounded subscores; code alone computes the average and rule caps. */
export function scoreFromAudit(original:ScriptReviewOutput,grounded:ScriptReviewOutput,audit:ScoreAudit):ScriptReviewOutput {
  const originalFindings=[...original.factualConcerns,...original.styleGuideViolations];
  const groundedFindings=[...grounded.factualConcerns,...grounded.styleGuideViolations];
  const criteria=new Set(audit.rubricSubscores.map(s=>s.criterion));
  if(criteria.size!==5)throw Error('Five distinct rubric subscores required');
  const seen=new Set<string>();
  for(const f of audit.findings){
    if(seen.has(f.finding))throw Error('Duplicate rule finding');seen.add(f.finding);
    if(!(originalFindings.includes(f.finding)||(['SR-3','SR-4','SR-5'].includes(f.rule)&&original.notes.includes(f.finding)))||!new RegExp('^'+f.rule+'\\b').test(f.finding))throw Error('Rule finding must reference an exact concern under the same rule');
  }
  const eligible=new Set(audit.findings.filter(f=>!['SR-3','SR-4','SR-5'].includes(f.rule)&&groundedFindings.includes(f.finding)).map(f=>f.finding));
  let total=0;
  for(const part of audit.rubricSubscores){
    if(part.score<10){
      if(!part.finding||advisory.test(part.finding)) { total+=10;continue; }
      // A lower subscore needs an objective, surviving finding. Mere style advice cannot enter the grade.
      if(!eligible.has(part.finding)){total+=10;continue;}
    }
    total+=part.score;
  }
  const score=Math.round(total/5*100)/100;
  return {...grounded,score,notes:[grounded.notes,'D2 score: code rubric average '+score+'; advisory findings excluded.'].join('\n')};
}

/** Archived model replies retain their historical replay contract only. */
export function scoreWithoutAdvisories(original:ScriptReviewOutput,grounded:ScriptReviewOutput,audit:LegacyScoreAudit,softProp:(f:string)=>boolean,legacyReplay=true):ScriptReviewOutput {
 const originalFindings=[...original.factualConcerns,...original.styleGuideViolations],findings=[...grounded.factualConcerns,...grounded.styleGuideViolations];
 let rubricBase:number;
 if(legacyReplay&&audit.rubricDeductions===undefined)rubricBase=audit.rubricScore;
 else {
  if(!audit.rubricDeductions)throw Error('Auditable rubric deductions required');
  const seenRubric=new Set<string>();let rubricPenalty=0;
  for(const d of audit.rubricDeductions){
   const key=d.criterion+'|'+d.finding;if(seenRubric.has(key))throw Error('Duplicate rubric deduction');seenRubric.add(key);
   if(advisory.test(d.finding))throw Error('Advisory reason cannot be a rubric deduction');
   rubricPenalty+=d.points;
  }
  rubricBase=Math.round(Math.max(0,10-rubricPenalty)*100)/100;
  if(Math.abs(audit.rubricScore-rubricBase)>.01)throw Error('Opaque rubric grade disagrees with eligible rubric deductions');
 }
 let penalty=0;const ignored:string[]=[],seen=new Set<string>();
 for(const d of audit.deductions){
  if(['SR-3','SR-4','SR-5'].includes(d.rule)){ignored.push(d.rule);continue;}
  if(!originalFindings.includes(d.finding)||!new RegExp('^'+d.rule+'\\b').test(d.finding))throw Error('Score deduction must reference an exact finding under the same rule');
  if(!findings.includes(d.finding)||softProp(d.finding)){ignored.push(d.rule+' dismissed/scene-prop');continue;}
  if(seen.has(d.finding))throw Error('Duplicate score deduction');seen.add(d.finding);penalty+=d.points;
 }
 const score=Math.round(Math.max(0,rubricBase-penalty)*100)/100;
 return {...grounded,score,notes:[grounded.notes,(legacyReplay&&audit.rubricDeductions===undefined?'D2 score: rubric ':'D2 score: audited rubric ')+rubricBase+' minus eligible deductions '+penalty+'; SR-3/4/5 excluded.'+(ignored.length?' Ignored: '+ignored.join(', ')+'.':'')].join('\n')};
}

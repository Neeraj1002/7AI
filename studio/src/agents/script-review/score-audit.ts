import { z } from 'zod';
import type { ScriptReviewOutput } from './index';
const RubricDeductionSchema=z.object({criterion:z.enum(['chapter-order','open-loop','factual-causality','brief-brand','hook-promise']),points:z.number().min(0).max(10),finding:z.string().min(1)});
export const ScoreAuditSchema=z.object({rubricScore:z.number().min(0).max(10),rubricDeductions:z.array(RubricDeductionSchema),deductions:z.array(z.object({rule:z.enum(['SR-1','SR-2','SR-3','SR-4','SR-5','SR-7','SR-8','SR-9']),points:z.number().min(0).max(10),finding:z.string().min(1)}))});
export const LegacyScoreAuditSchema=ScoreAuditSchema.partial({rubricDeductions:true});
export type ScoreAudit=z.infer<typeof ScoreAuditSchema>;
export type LegacyScoreAudit=z.infer<typeof LegacyScoreAuditSchema>;
/** Compute the base grade only from named eligible rubric deductions. An opaque low grade cannot hide advisory penalties. */
export function scoreWithoutAdvisories(original:ScriptReviewOutput,grounded:ScriptReviewOutput,audit:ScoreAudit|LegacyScoreAudit,softProp:(f:string)=>boolean,legacyReplay=false):ScriptReviewOutput {
 const originalFindings=[...original.factualConcerns,...original.styleGuideViolations],findings=[...grounded.factualConcerns,...grounded.styleGuideViolations];
 let rubricBase:number;
 if(legacyReplay&&audit.rubricDeductions===undefined)rubricBase=audit.rubricScore;
 else {
  if(!audit.rubricDeductions)throw Error('Auditable rubric deductions required');
  const seenRubric=new Set<string>();let rubricPenalty=0;
  for(const d of audit.rubricDeductions){
   const key=d.criterion+'|'+d.finding;if(seenRubric.has(key))throw Error('Duplicate rubric deduction');seenRubric.add(key);
   if(/\b(?:SR-[345]|repetit(?:ion|ive)|filler|padding|padded|awkward|pronunciat\w*|meta-commentary|thin visuals?|flatness|static visuals?)\b/i.test(d.finding))throw Error('Advisory reason cannot be a rubric deduction');
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

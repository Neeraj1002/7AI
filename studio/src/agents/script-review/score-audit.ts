import { z } from 'zod';
import type { ScriptReviewOutput } from './index';
export const ScoreAuditSchema=z.object({rubricScore:z.number().min(0).max(10),deductions:z.array(z.object({rule:z.enum(['SR-1','SR-2','SR-3','SR-4','SR-5','SR-7','SR-8','SR-9']),points:z.number().min(0).max(10),finding:z.string().min(1)}))});
export type ScoreAudit=z.infer<typeof ScoreAuditSchema>;
/** Uses the model's explicit rubric grade, never an invented minimum score. */
export function scoreWithoutAdvisories(original:ScriptReviewOutput,grounded:ScriptReviewOutput,audit:ScoreAudit,softProp:(f:string)=>boolean):ScriptReviewOutput {
 const originalFindings=[...original.factualConcerns,...original.styleGuideViolations],findings=[...grounded.factualConcerns,...grounded.styleGuideViolations];
 let penalty=0;const ignored:string[]=[],seen=new Set<string>();
 for(const d of audit.deductions){
  if(['SR-3','SR-4','SR-5'].includes(d.rule)){ignored.push(d.rule);continue;}
  if(!originalFindings.includes(d.finding)||!new RegExp('^'+d.rule+'\\b').test(d.finding))throw Error('Score deduction must reference an exact finding under the same rule');
  if(!findings.includes(d.finding)||softProp(d.finding)){ignored.push(d.rule+' dismissed/scene-prop');continue;}
  if(seen.has(d.finding))throw Error('Duplicate score deduction');seen.add(d.finding);penalty+=d.points;
 }
 const score=Math.round(Math.max(0,audit.rubricScore-penalty)*100)/100;
 return {...grounded,score,notes:[grounded.notes,'D2 score: rubric '+audit.rubricScore+' minus eligible deductions '+penalty+'; SR-3/4/5 excluded.'+(ignored.length?' Ignored: '+ignored.join(', ')+'.':'')].join('\n')};
}

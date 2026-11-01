import { briefFixesEndSentence } from '../agents/script-review/brief-checks';
import { parseBriefChapterPlan } from '../long-form/brief-chapter-plan';

// Sprint 6 Task 3: when the angle step has nothing to choose, it does not run and the run does not wait. The global
// switch is for every channel; these two cases are decided per channel and per brief. Returns the plain-words reason,
// or null when the step should run. No model call.
export function angleStepSkipReason(params: { gate1Enabled: boolean; briefText: string }): string | null {
  if (!params.gate1Enabled) return 'Gate 1 is off for this channel, so nobody would see the angle choice';
  if (briefFixesStructure(params.briefText)) return 'the brief already fixes how the video is built';
  return null;
}

// The brief fixes its structure when it gives exact opening or closing sentences, chapter titles, a word budget per
// chapter, or a fact allocation per chapter. A declared chapter count or a total length alone leaves room for an angle.
export function briefFixesStructure(briefText: string): boolean {
  if (briefFixesEndSentence(briefText)) return true;
  const plan = parseBriefChapterPlan(briefText);
  return plan.titles !== null || plan.wordBudgets !== null || plan.factAllocationCount !== null;
}

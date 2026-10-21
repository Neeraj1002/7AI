import type { PipelineStage } from '../types';

// Sprint 5 Task 8 (R11.1, E10): a run has two scripts, the writer's draft and the one a person approved
// or edited at Gate 1. The video is narrated from the approved one. The Script tab showed the draft, so
// the edit looked lost when it was not. This names both and says which one the video used.

type StageLike = Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'input' | 'output'>;
type Chapter = { title: string; text: string };

export type ScriptVersion = { text: string; chapters?: Chapter[] };
export type ApprovedScript = ScriptVersion & { outcome: 'approve' | 'edit' };
export type ScriptVersions = {
  draft: ScriptVersion | null;
  approved: ApprovedScript | null;
  // Which one the latest video was narrated from; null before any video attempt, or when it matches neither.
  usedByVideo: 'approved' | 'draft' | null;
};

function validChapters(value: unknown): Chapter[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const ok = value.filter(
    (c): c is Chapter => typeof c === 'object' && c !== null && typeof (c as Chapter).title === 'string' && typeof (c as Chapter).text === 'string',
  );
  return ok.length > 0 ? ok.map((c) => ({ title: c.title, text: c.text })) : undefined;
}

const latest = (stages: StageLike[], name: string, accept: (s: StageLike) => boolean) =>
  stages.filter((s) => s.stageName === name && s.status === 'completed' && s.output && accept(s)).sort((a, b) => b.attemptNumber - a.attemptNumber)[0];

export function deriveScriptVersions(stages: StageLike[]): ScriptVersions {
  const generation = latest(stages, 'script_generation', () => true);
  const genOut = generation?.output as { scriptText?: string; chapters?: unknown } | undefined;
  const draft: ScriptVersion | null = typeof genOut?.scriptText === 'string'
    ? { text: genOut.scriptText, ...(validChapters(genOut.chapters) && { chapters: validChapters(genOut.chapters) }) }
    : null;

  const gate = latest(stages, 'gate1', (s) => {
    const o = (s.output as { outcome?: string; sanctionedScriptText?: unknown }).outcome;
    return (o === 'approve' || o === 'edit') && typeof (s.output as { sanctionedScriptText?: unknown }).sanctionedScriptText === 'string';
  });
  const gateOut = gate?.output as { outcome?: string; sanctionedScriptText?: string; chapters?: unknown } | undefined;
  const approved: ApprovedScript | null = gateOut
    ? {
        outcome: gateOut.outcome as 'approve' | 'edit',
        text: gateOut.sanctionedScriptText as string,
        ...(validChapters(gateOut.chapters) && { chapters: validChapters(gateOut.chapters) }),
      }
    : null;

  const video = stages
    .filter((s) => s.stageName === 'video_generation' && s.status !== 'skipped' && typeof (s.input as { scriptText?: unknown } | null)?.scriptText === 'string')
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const usedText = (video?.input as { scriptText?: string } | null | undefined)?.scriptText;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  let usedByVideo: ScriptVersions['usedByVideo'] = null;
  if (usedText !== undefined) {
    if (approved && norm(approved.text) === norm(usedText)) usedByVideo = 'approved';
    else if (draft && norm(draft.text) === norm(usedText)) usedByVideo = 'draft';
  }
  return { draft, approved, usedByVideo };
}

// The chapters the Script tab shows: the approved ones once a person has approved or edited, the
// writer's draft before that. undefined for a Short or before a long script exists.
export function deriveDisplayChapters(stages: StageLike[]): Chapter[] | undefined {
  const versions = deriveScriptVersions(stages);
  return versions.approved?.chapters ?? versions.draft?.chapters;
}

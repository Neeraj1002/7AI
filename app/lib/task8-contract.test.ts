// Sprint 5 Task 7 — the app's readers against the server's real types (Task 8, PR #107, merged).
// The type checks below fail `tsc` if the server renames one of the fields the app reads; the runtime checks feed the
// readers data shaped by those same types. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { costBreakdownOf } from './run-cost';
import { serverOutcomesOf, outcomeOfStage } from './attempt-outcome';
import { scriptVersionsOf } from './script-versions';
import { parseVoiceEntry } from './voice-catalog';
import { updateInput } from './run-settings';
import { contractFieldsExist, retryFlag } from './task8-contract';

describe('Task 8 contract, as the server types it', () => {
  it('has every field the readers use (checked by tsc)', () => {
    expect(contractFieldsExist).toBe(true);
    expect(retryFlag).toBe(true);
  });

  it('cost: reads cost, videoAttempts and stageSummaries', () => {
    const data = {
      cost: { spentUsd: 0.3, estimateUsd: 0.24, limitUsd: 1, attemptsUsd: 0.25, otherStagesUsd: 0.05, unattributedUsd: 0 },
      videoAttempts: [{ attempt: 1, outcome: 'completed', costUsd: 0.25, stages: [{ stageId: 'g', stageName: 'video_generation', attemptNumber: 1, status: 'completed', outcome: 'completed', costUsd: 0.25 }] }],
      stageSummaries: [
        { stageId: 'g', stageName: 'video_generation', attemptNumber: 1, status: 'completed', outcome: 'completed', costUsd: 0.25, videoAttempt: 1 },
        { stageId: 's', stageName: 'script_generation', attemptNumber: 1, status: 'completed', outcome: 'completed', costUsd: 0.05 },
      ],
    };
    const b = costBreakdownOf(data)!;
    expect([b.totalUsd, b.estimateUsd, b.limitUsd, b.attemptsUsd, b.otherStagesUsd, b.unattributedUsd]).toEqual([0.3, 0.24, 1, 0.25, 0.05, 0]);
    expect(b.attempts).toHaveLength(1);
    expect(b.others.map((o) => o.stageName)).toEqual(['script_generation']);
  });

  it('outcome and reasonCode: read from stageSummaries and videoAttempts', () => {
    const data = {
      stageSummaries: [{ stageId: 'r', stageName: 'video_review', attemptNumber: 1, status: 'completed', outcome: 'failed_review', reasonCode: 'shot_length', reason: 'Longest shot 8.3 s', costUsd: 0.01, videoAttempt: 1 }],
      videoAttempts: [{ attempt: 1, outcome: 'failed_review', reasonCode: 'shot_length', reason: 'Longest shot 8.3 s', costUsd: 0.2, stages: [] }],
    };
    const server = serverOutcomesOf(data);
    const gen = { id: 'g', stageName: 'video_generation', status: 'completed', attemptNumber: 1, output: null };
    const o = outcomeOfStage(gen, [gen], server);
    expect([o.kind, o.reasonCode]).toEqual(['failed_review', 'shot_length']);
  });

  it('scripts { draft, approved, usedByVideo }', () => {
    const v = scriptVersionsOf([], false, { scripts: { draft: { text: 'a b c' }, approved: { text: 'a b c d', outcome: 'edit' }, usedByVideo: 'approved' } });
    expect([v.draft?.words, v.approved?.words, v.approved?.edited, v.usedByVideo]).toEqual([3, 4, true, 'approved']);
  });

  it('options.list.voices[] { key, label, toneTags, previews { sad, hopeful } }', () => {
    const v = parseVoiceEntry({ key: 'coral', label: 'Coral', toneTags: ['warm'], previews: { sad: 'https://x/s', hopeful: 'https://x/h' } });
    expect([v?.id, v?.displayName, v?.toneTags, v?.previews?.hopeful]).toEqual(['coral', 'Coral', ['warm'], 'https://x/h']);
  });

  it('runs.updateSettings input has the retry flag and no nulls', () => {
    expect(updateInput('11111111-1111-4111-8111-111111111111', { voice: 'coral', audioLayer: null }, true)).toEqual({ runId: '11111111-1111-4111-8111-111111111111', voice: 'coral', retry: true });
  });
});

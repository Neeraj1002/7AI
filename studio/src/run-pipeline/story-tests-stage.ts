import { env } from '../config/env';
import type { Purpose } from '../llm';
import { prisma } from '../models/prisma-client';
import { insertUsageEvent } from '../models/repositories/usage-event.repository';
import { findChannelById } from '../models/repositories/channel.repository';
import { findLatestCompletedAttempt } from '../models/repositories/pipeline-stage.repository';
import { applyAngleChoice } from '../story-tests/choice';
import { notRunStoryTests, runAngleStep } from '../story-tests/angle-step';
import { readStoredStoryTests } from '../story-tests/view';
import type { StoredStoryTests } from '../story-tests/schemas';
import type { IntakeParsed, PipelineRun } from '../types';
import { composeNotificationChannel, resolveNotificationRecipients } from '../notifications';
import { checkBudget } from './budget-gate';
import { loadResolvedConfig } from './resolved-config';
import { failureUsageEvents, llmUsageRows } from './stage-failure';

// Sprint 6 Task 3, Part A, at the run level: the switch, the usage booking, and the founder's choice.

export function storyTestsEnabled(): boolean {
  return env.STORY_TESTS_ENABLED === '1';
}

// Runs inside intake, after its work and before it completes. Returns null when the feature is off (the run is exactly
// as before). Never throws: a failure is recorded as "not run" and the script step follows.
export async function runAngleStepForRun(params: { run: PipelineRun; stageId: string; intake: IntakeParsed }): Promise<StoredStoryTests | null> {
  if (!storyTestsEnabled()) return null;
  const { run } = params;
  try {
    const channel = await findChannelById(run.channelId);
    if (!channel) return notRunStoryTests('the channel could not be found');
    const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
    if (!budget.ok) return notRunStoryTests("the channel's spending limit is reached");
    const config = await loadResolvedConfig(run, channel);
    return await runAngleStep({
      topic: params.intake.topic,
      constraints: params.intake.constraints,
      sourceText: [run.briefText, params.intake.topic, ...params.intake.constraints].join('\n'),
      persona: config.readerPersona,
      format: config.videoKind,
      deps: {
        meter: async (llm, purpose: Purpose) => {
          for (const row of llmUsageRows(llm)) {
            await insertUsageEvent({ tenantId: run.tenantId, channelId: run.channelId, pipelineRunId: run.id, stageId: params.stageId, agent: purpose, ...row });
          }
        },
        bookFailure: async (error, purpose: Purpose) => {
          for (const spent of failureUsageEvents(error)) {
            if (Number(spent.costUsd) > 0) {
              await insertUsageEvent({ tenantId: run.tenantId, channelId: run.channelId, pipelineRunId: run.id, stageId: params.stageId, agent: `${purpose}-failed-call`, ...spent });
            }
          }
        },
      },
    });
  } catch (error) {
    console.error(`[story-tests] run ${run.id}: angle step failed, the script follows without it - ${error instanceof Error ? error.message : String(error)}`);
    return notRunStoryTests('the angle step stopped unexpectedly');
  }
}

// The notice: a short message to the channel's recipients when the run starts waiting for an angle, the way Gate 1 sends its
// prompt. Best effort; the run is paused and the app shows it whether or not this reaches anyone (the reminder follows later).
export async function notifyAngleWaiting(run: Pick<PipelineRun, 'id' | 'briefText' | 'channelId'>): Promise<void> {
  try {
    const channel = await findChannelById(run.channelId);
    if (!channel) return;
    const recipients = await resolveNotificationRecipients(channel);
    const notifier = await composeNotificationChannel({ tenantId: channel.tenantId, channelId: channel.id, userIds: recipients.map((u) => u.id) });
    await notifier.notify(formatAngleWaitingNotice({ channelName: channel.name, briefText: run.briefText }), { threadKey: run.id });
  } catch (error) {
    console.error(`[story-tests] run ${run.id}: could not send the angle notice - ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function formatAngleWaitingNotice(params: { channelName: string; briefText: string }): string {
  const firstLine = (params.briefText.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '').replace(/^topic:\s*/i, '');
  const brief = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  const what = brief ? '"' + brief + '" on ' + params.channelName : params.channelName;
  return 'Pick an angle: ' + what + ' has angles ready. Open the app to choose one before the script is written.';
}

export class AngleChoiceError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}

// C4. Persists the choice and moves the run on, in one transaction: the choice is on the intake stage row before the
// script step can start. The status flip is conditional on `paused_angle`, so two answers cannot both win.
export async function persistAngleChoice(runId: string, angleId: string | null, now: Date = new Date()): Promise<void> {
  const intake = await findLatestCompletedAttempt(runId, 'intake');
  const stored = readStoredStoryTests(intake?.output);
  if (!intake || !stored) throw new AngleChoiceError('CONFLICT', `Run ${runId} is not waiting for an angle choice`);
  const applied = applyAngleChoice(stored, angleId, now);
  if (!applied.ok) {
    throw applied.error === 'unknown_angle'
      ? new AngleChoiceError('BAD_REQUEST', "That angle is not one of this run's angles")
      : new AngleChoiceError('CONFLICT', `The angle for run ${runId} is not currently pending (already chosen or skipped)`);
  }
  await prisma.$transaction(async (tx) => {
    const moved = await tx.pipelineRun.updateMany({
      where: { id: runId, status: 'paused_angle' },
      data: { status: 'running', currentStage: 'script_generation' },
    });
    if (moved.count === 0) {
      throw new AngleChoiceError('CONFLICT', `The angle for run ${runId} is not currently pending (already chosen or skipped, or not open yet)`);
    }
    await tx.pipelineStage.update({
      where: { id: intake.id },
      data: { output: { ...(intake.output ?? {}), storyTests: applied.next } as never },
    });
  });
}

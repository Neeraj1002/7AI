import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Pressable, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTRPC, useTRPCClient } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useChannels } from '../../../lib/channel-context';
import { useAuthedVideoSource } from '../../../lib/use-video-source';
import { flags } from '../../../lib/feature-flags';
import { chapterWarningOf, manualRetryOf, videoFallbackUsed } from '../../../lib/server-extras';
import { ageHours, automaticRegensUsed, AUTO_REGEN_CAP, isPublishingPhase, relativeTime, runTopic, startedLabel, stepperIndexForStage } from '../../../lib/run-labels';
import { shortSentence } from '../../../lib/failure-text';
import type { StepperEnd } from '../../../lib/stepper-colors';
import { EditSettingsSheet, type CurrentSettings } from '../../../components/EditSettingsSheet';
import { canEditSettings, settingsChangeNotes } from '../../../lib/run-settings';
import { VOICES } from '../../../lib/pipeline-options';
import { serverOutcomesOf } from '../../../lib/attempt-outcome';
import { chapterBoundsOf } from '../../../lib/chapter-bounds';
import { intakeWarningsOf } from '../../../lib/intake-warnings';
import { IntakeWarnings } from '../../../components/IntakeWarnings';
import { CostCard } from '../../../components/CostCard';
import { costBreakdownOf } from '../../../lib/run-cost';
import { ScriptVersionsCard } from '../../../components/ScriptVersionsCard';
import { scriptVersionsOf } from '../../../lib/script-versions';
import { NeedsAttentionCard, EndedCard, InProgressCard } from '../../../components/RunStateCards';
import { buildStepHistory, POST_HOC_TAGS, runChip, settingTiles, tagLabel, type StageLike } from '../../../lib/run-view';
import { color, font, radius, space, type } from '../../../lib/theme';
import { VideoChip } from '../../../components/VideoChip';
import { LongPreview } from '../../../components/LongPreview';
import { SubtitlesCard } from '../../../components/SubtitlesCard';
import { Gate2Packages } from '../../../components/Gate2Packages';
import { EditTitleScreen } from '../../../components/EditTitleScreen';
import { Gate2Thumbnail } from '../../../components/Gate2Thumbnail';
import {
  approveNeedsAsk,
  canChoose,
  gate2Screen,
  packagingCostLine,
  packagingPollMs,
  packagingQueryWanted,
  statusLine,
  type Gate2Package,
} from '../../../lib/gate2-packaging';
import { RaiseLimitSheet } from '../../../components/RaiseLimitSheet';
import { mmss, needsHigherLimit } from '../../../lib/long-video';
import { FormScreen } from '../../../components/FormScreen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { Stepper } from '../../../components/Stepper';
import { RunSettingsTiles } from '../../../components/RunSettingsTiles';
import { RunTabs, type RunTab } from '../../../components/RunTabs';
import { StepHistory } from '../../../components/StepHistory';
import { BottomActionBar } from '../../../components/BottomActionBar';
import { GateActionBar, type Privacy } from '../../../components/GateActionBar';
import { ClampedText } from '../../../components/ClampedText';
import { QualityChecksCard } from '../../../components/QualityChecksCard';
import { Gate1ReviewCards, RepeatTopicBanner } from '../../../components/Gate1ReviewCards';
import { PrimaryButton, SecondaryButton, DangerOutlineButton } from '../../../components/Buttons';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { IndeterminateBar } from '../../../components/IndeterminateBar';
import type { AppRouter } from '../../../../studio/src/api/router';

type RunDetail = inferRouterOutputs<AppRouter>['runs']['get'];
type ReviewLogRow = RunDetail['reviewLogs'][number];
type Gate2Input = inferRouterInputs<AppRouter>['runs']['gate2'];

const CANCEL_TIMEOUT_MS = 60_000;

// Task 6/E2 — what was actually sent, phrased for the "Decision sent" card.
// Derived from the mutation's own arguments at submit time (not from the
// server's lastGateDecision, which may not have caught up to a poll yet).
function decisionSummary(gate: 1 | 2, action: string, privacy?: Privacy): string {
  if (gate === 1) {
    if (action === 'approve') return 'Approved script';
    if (action === 'edit') return 'Script edited and approved';
    return 'Rejected';
  }
  if (action === 'approve') return `Approved · upload as ${privacy ?? 'private'}`;
  if (action === 'revise') return 'Sent back with notes';
  return 'Rejected';
}

// No fixed tag vocabulary is enforced server-side (Backend Task 7/O4); the app owns the
// quick-pick list (POST_HOC_TAGS in lib/run-view.ts), free text is always accepted.
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const FOUNDER_POST_HOC_AGENT = 'founder-post-hoc';

type Stage = {
  id: string;
  stageName: string;
  status: string;
  attemptNumber: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
};

function latestStage(stages: Stage[], name: string): Stage | undefined {
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    if (stages[i].stageName === name) return stages[i];
  }
  return undefined;
}

export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { token, apiUrl } = useAuth();
  const { channelById } = useChannels();
  const [barHeight, setBarHeight] = useState(0);

  // Bugs Task 9 (R3) — the gate attempt a decision was just sent for. Its
  // buttons stay hidden (and the screen keeps polling) until the run moves on,
  // so a second tap can no longer hit "Gate N is not currently pending".
  const [decisionSentFor, setDecisionSentFor] = useState<string | null>(null);
  // Task 6/E2 — what the decision-sent card should say; derived once at
  // submit time from the mutation's own variables.
  const [sentSummary, setSentSummary] = useState<string | null>(null);
  // Brief / Script / Video tab; null until the user picks one, so the default follows the run's state.
  const [tabChoice, setTabChoice] = useState<RunTab | null>(null);
  const [confirmCancelRunning, setConfirmCancelRunning] = useState(false);
  // Bugs Task 10 (R2) — whether a cancel is in flight comes from the server
  // (`cancelRequested` on runs.get), so it survives leaving the screen,
  // switching tabs and an app restart. Local state only covers the moment
  // between the tap and the first refetch, and the "Run cancelled" confirmation.
  const [cancelTimedOut, setCancelTimedOut] = useState(false);
  // Bumped on each (re-)request so the 60s window restarts even when the
  // server's cancelRequested was already true.
  const [cancelAttempt, setCancelAttempt] = useState(0);
  const [showCancelledNotice, setShowCancelledNotice] = useState(false);
  useEffect(() => {
    if (!showCancelledNotice) return;
    const t = setTimeout(() => setShowCancelledNotice(false), 5_000);
    return () => clearTimeout(t);
  }, [showCancelledNotice]);

  // Bugs Task 7 (R4) — poll while the pipeline is working, so the screen moves
  // to the gate / needs-attention state on its own instead of looking frozen.
  const { data, isLoading, error, refetch } = useQuery(
    trpc.runs.get.queryOptions(
      { id: id! },
      {
        refetchInterval: (query) => {
          const status = query.state.data?.run.status;
          // R2 — poll faster while a cancel is waiting for the loop's next step.
          if (query.state.data?.cancelRequested) return 3_000;
          return status === 'running' || status === 'pending' || decisionSentFor ? 5_000 : false;
        },
      },
    ),
  );

  // R2 — if the run is still not ended 60s after a cancel was requested (the
  // request can be lost to a server restart, E5's in-memory-registry caveat),
  // say so and let the user try again. Set only from inside the timer callback.
  const cancelRequestedNow = data?.cancelRequested ?? false;
  useEffect(() => {
    if (!cancelRequestedNow) return;
    const t = setTimeout(() => setCancelTimedOut(true), CANCEL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [cancelRequestedNow, cancelAttempt]);

  // Fix 2 — never leave an endless spinner: if the run hasn't loaded within
  // 10s, fall back to the same "couldn't load" screen an outright error
  // shows. Reset happens in the Retry button's own handler, not here, so
  // this effect only ever sets state from inside the timer callback.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setLoadTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, [isLoading]);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.runs.get.queryKey({ id: id! }) }),
      queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() }),
    ]);

  const markDecisionSent = (summary: string) => {
    const gateStage = data && latestStage(data.stages, data.run.status === 'paused_gate1' ? 'gate1' : 'gate2');
    setDecisionSentFor(gateStage?.id ?? null);
    setSentSummary(summary);
    return invalidate();
  };
  const gate1Mutation = useMutation(
    trpc.runs.gate1.mutationOptions({
      onSuccess: (_res, variables) => markDecisionSent(decisionSummary(1, variables.action)),
    }),
  );
  const gate2Mutation = useMutation(
    trpc.runs.gate2.mutationOptions({
      onSuccess: (_res, variables) =>
        markDecisionSent(
          decisionSummary(2, variables.action, (variables as { privacyStatus?: Privacy }).privacyStatus),
        ),
    }),
  );
  // Sprint 6 Task 1 (R5): the thumbnail and title options made for a long video's Gate 2, and the founder's choice.
  // Fetched while Gate 2 is open (polling until the options exist) and once published (to offer the chosen file).
  // Sprint 6 Task 1: the Gate 2 packages (or a Short's opening), polled while the server says they are being made.
  const packagingQuery = useQuery(
    trpc.runs.packaging.queryOptions(
      { runId: id! },
      { enabled: Boolean(id) && Boolean(data) && packagingQueryWanted(data!.run), refetchInterval: (query) => packagingPollMs(query.state.data) },
    ),
  );
  const gate2Response = packagingQuery.data;
  const trpcClient = useTRPCClient();
  const [editingPackage, setEditingPackage] = useState<Gate2Package | null>(null);
  const [askYoutube, setAskYoutube] = useState<{ privacy?: Privacy } | null>(null);
  const checkTitle = useCallback(
    (title: string) => trpcClient.runs.checkPackageTitle.query({ runId: id!, packageId: editingPackage?.id ?? '', title }),
    [trpcClient, id, editingPackage],
  );
  const chooseMutation = useMutation(
    trpc.runs.choosePackage.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.runs.packaging.queryKey({ runId: id! }) }),
    }),
  );
  // Bugs Task 7 (R3) — the way out of needs_attention. Also used for E5
  // (cancel while running/pending) — same endpoint, different confirm copy
  // and follow-up UI since a running cancel isn't guaranteed synchronous.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  // R4: Edit settings sheet, and the lines it just recorded (shown in Step history until the server's own list arrives).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedSettingNotes, setSavedSettingNotes] = useState<string[]>([]);
  // Something the user still has to do after a save (a run in legacy planner recovery is retried on its own).
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const retryMutation = useMutation(
    trpc.runs.retry.mutationOptions({
      onSuccess: () => {
        setLimitOpen(false);
        return invalidate();
      },
    }),
  );
  const cancelMutation = useMutation(
    trpc.runs.cancel.mutationOptions({
      onSuccess: (res) => {
        setConfirmCancel(false);
        setConfirmCancelRunning(false);
        setCancelTimedOut(false);
        setCancelAttempt((n) => n + 1);
        // Only a run that really ended as a cancel earns the confirmation; an
        // already-ended run just refreshes into its real ended screen.
        if (res.immediate && res.cancelled) setShowCancelledNotice(true);
        return invalidate();
      },
      onError: () => {
        setConfirmCancel(false);
        setConfirmCancelRunning(false);
      },
    }),
  );
  const rerunMutation = useMutation(
    trpc.runs.rerun.mutationOptions({
      onSuccess: async (newRun) => {
        await queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() });
        router.replace(`/run/${newRun.id}`);
      },
    }),
  );

  const videoUrl = useMemo(
    () => (apiUrl && data && data.videoKind !== 'long' ? `${apiUrl.replace(/\/$/, '')}/runs/${data.run.id}/video` : null),
    [apiUrl, data],
  );
  const videoSource = useAuthedVideoSource(data?.run.status === 'paused_gate2' ? videoUrl : null, token ?? '');
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  if (!data && (error || loadTimedOut)) {
    return (
      <FormScreen variant="stack" title="Run">
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load this run</Text>
          <View style={styles.loadErrorActions}>
            <PrimaryButton
              label="Retry"
              icon="rotate-cw"
              onPress={() => {
                setLoadTimedOut(false);
                void refetch();
              }}
            />
            <SecondaryButton label="Back" onPress={() => router.back()} />
          </View>
        </View>
      </FormScreen>
    );
  }

  if (isLoading || !data) {
    return (
      <FormScreen variant="stack" title="Run">
        <View style={styles.center}>
          <ActivityIndicator color={color.accent} />
        </View>
      </FormScreen>
    );
  }

  const { run, stages } = data;
  const channel = channelById(run.channelId);
  const scriptGenStage = latestStage(stages, 'script_generation');
  const scriptReviewStage = latestStage(stages, 'script_review');
  const videoReviewStage = latestStage(stages, 'video_review');
  // Bugs Task 9 (R3) — post-publish data (c13da242: "can't see any uploads").
  const publishOutput = latestStage(stages, 'publishing')?.output as
    | {
        youtubeVideoId?: string;
        privacyStatus?: string;
        metadata?: { title?: string };
        coverFrameSet?: boolean;
        coverFrameMessage?: string;
      }
    | undefined;

  // gate2PackageScreens: the thumbnail result and what the new section needs from the packaging query.
  const thumbnailResult = data.thumbnail ?? null;
  const gate2View = gate2Response?.view ?? null;
  const gate2Kind = gate2Screen(gate2Response);
  const thumbnailPictureUrl = thumbnailResult?.packageId ? (gate2View?.packages.find((p) => p.id === thumbnailResult.packageId)?.imageUrls?.feed ?? null) : null;

  const scriptText = (scriptGenStage?.output?.scriptText as string | undefined) ?? '';
  const isLong = data.videoKind === 'long';
  const chapters = isLong ? data.chapters : undefined;
  // Gate 1 edit sheet of a long script: chapters as "## Title" lines followed by their text (Task 9 R2.5).
  const editText = isLong ? (data.scriptEditText ?? scriptText) : scriptText;
  const atLimit = needsHigherLimit({ videoKind: data.videoKind, spentUsd: data.spentUsd, maxCostUsd: data.maxCostUsd });
  // Task 8: a run paused by the automatic-retry allowance (not by the limit itself) is also continued with a higher limit.
  const allowanceStop = Boolean(run.lastError?.startsWith('Automatic retry allowance used'));
  const canRaiseLimit = atLimit || (allowanceStop && data.spentUsd !== undefined && data.maxCostUsd !== undefined);
  const lengthLabel = isLong && typeof data.qualityMetrics?.durationSeconds === 'number' ? mmss(data.qualityMetrics.durationSeconds) : null;
  // R3: after Gate 1 the screens show the approved (narrated) text, the writer's draft as a labelled extra.
  const scriptVersions = scriptVersionsOf(stages as unknown as Parameters<typeof scriptVersionsOf>[0], isLong, data);
  const approvedChapters = scriptVersions.approved?.chapters;
  const reviewScore = scriptReviewStage?.output?.score as number | undefined;
  const reviewNotes = scriptReviewStage?.output?.notes as string | undefined;
  const videoVerdict = videoReviewStage?.output?.verdict as string | undefined;
  const videoRationale = videoReviewStage?.output?.rationale as string | undefined;
  // The reviewer's own words for the latest review that said fail (the failure card quotes it).
  const lastFailedReviewReason = [...stages]
    .reverse()
    .find((s) => s.stageName === 'video_review' && s.output?.verdict === 'fail')?.output?.rationale as string | undefined;
  const videoPassed = videoVerdict === 'pass' ? true : videoVerdict === 'fail' ? false : undefined;
  // R2: per-attempt and per-stage cost from Task 8 R8.7 when the server sends it; spentUsd/maxCostUsd until then.
  const costs = costBreakdownOf(data);
  const videoAttempts = stages.filter((s) => s.stageName === 'video_generation').length;
  // Automatic regenerations only (failed video reviews, max 2); manual Revise presses are not counted.
  const regensUsed = videoAttempts > 0 ? automaticRegensUsed(stages) : undefined;

  const isGate1 = run.status === 'paused_gate1';
  const isGate2 = run.status === 'paused_gate2';
  const isNeedsAttention = run.status === 'needs_attention';
  const currentStage = isGate1 ? 'gate1' : isGate2 ? 'gate2' : run.currentStage;
  const stepIndex = run.status === 'completed' ? 7 : stepperIndexForStage(currentStage);
  // R11.4: a finished run is all green, a failure is red only on the step it failed on, a user stop is grey.
  const stepperEnd: StepperEnd | undefined =
    run.status === 'completed' ? 'completed' : run.status === 'failed' ? (data.endReason === 'cancelled' || data.endReason === 'rejected' ? 'stopped' : 'failed') : undefined;

  const defaultPrivacy: Privacy | undefined = channel?.defaultPrivacyStatus;
  // Bugs Task 12 (R2): the manual Retry / Revise cap, from the server (absent on an older server).
  const manualRetry = manualRetryOf(data);
  // U13: what the 'retry limit' stop means for THIS run (stock footage vs AI stills).
  const lastVideoPlan = latestStage(stages, 'video_generation')?.output as { plan?: { visualSource?: string } } | undefined;
  const capNextStep =
    run.lastError?.startsWith('Video Intelligence regen cap') || run.lastError?.startsWith('Gate 2 regen cap')
      ? `${lastVideoPlan?.plan?.visualSource === 'ai-stills' ? 'The video did not pass review' : 'Stock footage did not match your topic'} after ${videoAttempts} ${videoAttempts === 1 ? 'try' : 'tries'}. Retry, edit the brief, or cancel.`
      : null;

  const openGateStage = isGate1 ? latestStage(stages, 'gate1') : isGate2 ? latestStage(stages, 'gate2') : undefined;
  const decisionSent = decisionSentFor !== null && decisionSentFor === openGateStage?.id;

  // Task 6/E3 — B13's lastGateDecision/endReason tell us which of the three
  // post-Gate-2 outcomes we're in; B14 means "approved" really does drive
  // straight to publishing on the live server now, no restart needed.
  const { lastGateDecision, endReason } = data;
  const isEnded = run.status === 'failed';
  // Publishing phase = the upload AND the stats snapshot right after it (currentStage 'analytics'); the
  // video is live by then, so Cancel is not offered.
  const isPublishing = isPublishingPhase(run);
  const isUploading = run.status === 'running' && run.currentStage === 'publishing';
  const isRevising =
    run.status === 'running' &&
    run.currentStage === 'video_generation' &&
    lastGateDecision?.gate === 2 &&
    lastGateDecision.outcome === 'revise';
  // E5 — cancellable from Run detail only, for any run still in flight.
  // Fix 3: not while actually uploading — a cancel landing mid-upload could
  // leave a video live on YouTube while the app says "Cancelled".
  const isRunningOrPending = (run.status === 'running' || run.status === 'pending') && !isPublishing;
  const isPublished = run.status === 'completed' && !!publishOutput?.youtubeVideoId;

  const chip = runChip(run, endReason);
  const settings = settingTiles({
    creationOptions: run.creationOptions,
    resolved: data.resolvedOptions,
    videoKind: data.videoKind,
    targetSeconds: data.targetSeconds,
  });
  const history = buildStepHistory({
    stages: stages as unknown as StageLike[],
    lastGateDecision,
    gateDecisions: data.gateDecisions,
    server: serverOutcomesOf(data),
  });
  // What the old Details list added beyond the steps: the run's own last error and the stock-to-AI-stills switch.
  const historyNotes = [
    ...(run.lastError ? [`${run.lastError.includes('regen cap') ? "Reviewer's reason" : 'Last error'}: ${shortSentence(run.lastError, 160)}`] : []),
    ...(videoFallbackUsed(data) ? ['Switched to AI stills after stock footage failed review'] : []),
    // R4: setting changes are part of the history; the server's list wins once it sends one.
    ...(settingsChangeNotes(data).length > 0 ? settingsChangeNotes(data) : savedSettingNotes),
  ];
  const settingsRunnable = canEditSettings(run.status);
  const currentSettings: CurrentSettings = {
    voice: run.creationOptions?.voice ?? null,
    audioLayer: run.creationOptions?.audioLayer ?? null,
    visualSource: run.creationOptions?.visualSource ?? null,
    // The per-run visibility (runs.updateSettings, or Gate 2's choice) wins over the channel's default.
    privacyStatus: (run.creationOptions as { privacyStatus?: 'private' | 'unlisted' | 'public' } | null)?.privacyStatus ?? defaultPrivacy ?? 'private',
    maxCostUsd: data.maxCostUsd ?? null,
  };
  const channelVoiceLabel = VOICES.find((v) => v.value === channel?.defaultVoice)?.label ?? 'Alloy';
  // R11.3: the tag form is for a run that failed or a video that has had time to collect its first numbers.
  const showPostHoc = run.status === 'failed' || (run.status === 'completed' && ageHours(run.completedAt ?? run.createdAt) >= 6);
  // Default tab follows the state: the video at Gate 2, the script while it is made or reviewed, the brief once ended.
  const tab: RunTab = tabChoice ?? (isGate2 || (isPublished && isLong && data.previewUrl) ? 'video' : isGate1 || isNeedsAttention || isRunningOrPending ? 'script' : 'brief');

  const cancelRequested = data.cancelRequested;
  const cancelling = cancelMutation.isPending || (cancelRequested && !cancelTimedOut);

  const footer =
    (isGate1 || isGate2) && !decisionSent && !(isGate2 && gate2Kind === 'making') ? (
      <BottomActionBar onHeight={setBarHeight}>
        {isGate2 && gate2View && canChoose(gate2Response) ? (
          <Text style={[styles.cardMeta, statusLine(gate2View).tone === 'pending' ? styles.statusPending : styles.statusDone]}>{statusLine(gate2View).text}</Text>
        ) : null}
        <GateActionBar
          key={run.id + run.status}
          gate={isGate1 ? 1 : 2}
          isSubmitting={isGate1 ? gate1Mutation.isPending : gate2Mutation.isPending}
          initialEditText={editText}
          keepEditOpen={isGate1 && isLong}
          isLongScript={isLong}
          chapterBounds={chapterBoundsOf(data)}
          editError={isGate1 && gate1Mutation.variables?.action === 'edit' ? gate1Mutation.error?.message : null}
          onEditOpen={() => gate1Mutation.reset()}
          defaultPrivacy={defaultPrivacy}
          onApprove={(privacy) => {
            if (isGate1) gate1Mutation.mutate({ runId: run.id, action: 'approve' });
            else if (approveNeedsAsk(gate2Response)) setAskYoutube({ privacy });
            else {
              const payload: Gate2Input = {
                runId: run.id,
                action: 'approve',
                ...(flags.gate2Visibility && privacy ? { privacyStatus: privacy } : {}),
              };
              gate2Mutation.mutate(payload);
            }
          }}
          onReject={(reason) => {
            if (isGate1) gate1Mutation.mutate({ runId: run.id, action: 'reject', reason });
            else gate2Mutation.mutate({ runId: run.id, action: 'reject', reason });
          }}
          reviseDisabledReason={isGate2 && manualRetry?.reviseCapReached ? manualRetry.message : undefined}
          onEditOrRevise={(text) => {
            if (isGate1) gate1Mutation.mutate({ runId: run.id, action: 'edit', editedScriptText: text });
            else gate2Mutation.mutate({ runId: run.id, action: 'revise', notes: text });
          }}
        />
      </BottomActionBar>
    ) : isNeedsAttention ? (
      <BottomActionBar onHeight={setBarHeight}>
        <PrimaryButton
          label="Retry this step"
          icon="rotate-cw"
          loading={retryMutation.isPending}
          disabled={cancelMutation.isPending || Boolean(manualRetry?.retryCapReached)}
          onPress={() => (canRaiseLimit ? setLimitOpen(true) : retryMutation.mutate({ runId: run.id }))}
        />
        {manualRetry?.retryCapReached ? <Text style={styles.meta}>{manualRetry.message}</Text> : null}
        <SecondaryButton
          label="Edit settings"
          icon="sliders"
          disabled={retryMutation.isPending || cancelMutation.isPending}
          onPress={() => setSettingsOpen(true)}
        />
        <DangerOutlineButton
          label="Cancel run"
          icon="x"
          disabled={retryMutation.isPending || cancelMutation.isPending}
          onPress={() => setConfirmCancel(true)}
        />
      </BottomActionBar>
    ) : isEnded ? (
      <BottomActionBar onHeight={setBarHeight}>
        <PrimaryButton
          label="Run again"
          icon="rotate-cw"
          loading={rerunMutation.isPending}
          onPress={() => rerunMutation.mutate({ runId: run.id })}
        />
        <SecondaryButton
          label="Edit brief & run again"
          icon="edit-2"
          disabled={rerunMutation.isPending}
          onPress={() =>
            router.push({
              pathname: '/new-brief',
              params: {
                channelId: run.channelId,
                briefText: run.briefText,
                ...(run.creationOptions?.voice ? { voice: run.creationOptions.voice } : {}),
                ...(run.creationOptions?.visualSource ? { visualSource: run.creationOptions.visualSource } : {}),
                ...(run.creationOptions?.audioLayer ? { audioLayer: run.creationOptions.audioLayer } : {}),
                ...(isLong ? { videoKind: 'long' } : {}),
                ...(run.creationOptions?.targetDurationSec
                  ? { targetDurationSec: String(run.creationOptions.targetDurationSec) }
                  : {}),
              },
            })
          }
        />
        {rerunMutation.error ? <Text style={styles.errorText}>{rerunMutation.error.message}</Text> : null}
      </BottomActionBar>
    ) : isRunningOrPending ? (
      <BottomActionBar onHeight={setBarHeight}>
        <DangerOutlineButton
          label={cancelling ? 'Cancelling…' : cancelTimedOut ? "Couldn't cancel yet — try again" : 'Cancel run'}
          icon="x"
          loading={cancelling}
          disabled={cancelling}
          onPress={() => setConfirmCancelRunning(true)}
        />
        {cancelMutation.error ? <Text style={styles.errorText}>{cancelMutation.error.message}</Text> : null}
      </BottomActionBar>
    ) : null;

  const mutationError = (
    isGate1
      ? isLong && gate1Mutation.variables?.action === 'edit'
        ? null
        : gate1Mutation.error
      : isGate2
        ? gate2Mutation.error
        : ((limitOpen ? null : retryMutation.error) ?? (isRunningOrPending ? null : cancelMutation.error))
  )?.message;

  return (
    <FormScreen
      variant="stack"
      title="Run"
      subtitle={`${channel?.name ?? 'Deleted channel'} · started ${relativeTime(run.createdAt)}`}
      contentContainerStyle={[styles.content, { paddingBottom: barHeight + space.xl }]}
      footer={footer}
    >
      <View style={styles.statusRow}>
        <StatusChip kind={chip.kind} label={chip.label} />
        {isPublished ? (
          <Text style={styles.chipMeta}>
            {[publishOutput?.privacyStatus ? capitalise(publishOutput.privacyStatus) : null, `uploaded ${relativeTime(run.completedAt ?? run.createdAt)}`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>

      <Text style={styles.runTitle}>{isPublished && publishOutput?.metadata?.title ? publishOutput.metadata.title : runTopic(run)}</Text>
      <VideoChip videoKind={data.videoKind} targetSeconds={data.targetSeconds} />

      <RunSettingsTiles tiles={settings.tiles} formatLine={settings.formatLine} />

      {/* Follow-up R4: advice from intake, in amber, never blocking. */}
      <IntakeWarnings warnings={intakeWarningsOf(run)} />

      <Stepper currentIndex={stepIndex} end={stepperEnd} />

      {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}
      {settingsNotice ? <Text style={styles.meta}>{settingsNotice}</Text> : null}

      {/* R4: a waiting run can have its settings changed too; a stopped one gets the button in the action bar. */}
      {(isGate1 || isGate2) && !decisionSent && settingsRunnable ? (
        <Pressable onPress={() => setSettingsOpen(true)} accessibilityRole="button" style={styles.editSettings}>
          <Feather name="sliders" size={16} color={color.accentText} />
          <Text style={styles.editSettingsText}>Edit settings</Text>
        </Pressable>
      ) : null}

      {settingsRunnable ? (
        <EditSettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          runId={run.id}
          status={run.status}
          currentStage={run.currentStage}
          current={currentSettings}
          spentUsd={data.spentUsd ?? 0}
          channelDefaultVoice={channelVoiceLabel}
          onDone={({ lines, notice }) => {
            setSavedSettingNotes((prev) => [...prev, ...lines.map((l) => `Settings changed · ${l}`)]);
            setSettingsNotice(notice ?? null);
            void invalidate();
          }}
        />
      ) : null}

      {isNeedsAttention ? (
        <NeedsAttentionCard
          stage={run.currentStage}
          stages={stages as unknown as StageLike[]}
          lastError={run.lastError}
          extra={capNextStep}
          spentUsd={data.spentUsd}
          maxCostUsd={data.maxCostUsd}
          reviewReason={lastFailedReviewReason}
          videoAttempts={videoAttempts}
          onRaiseLimit={canRaiseLimit ? () => setLimitOpen(true) : undefined}
          onEditSettings={() => setSettingsOpen(true)}
        />
      ) : null}

      {canRaiseLimit && data.spentUsd !== undefined && data.maxCostUsd !== undefined ? (
        <RaiseLimitSheet
          visible={limitOpen}
          onClose={() => setLimitOpen(false)}
          spentUsd={data.spentUsd}
          maxCostUsd={data.maxCostUsd}
          pending={retryMutation.isPending}
          serverError={retryMutation.error?.message ?? null}
          onContinue={(maxCostUsd) => retryMutation.mutate({ runId: run.id, maxCostUsd })}
          onCancelRun={() => {
            setLimitOpen(false);
            setConfirmCancel(true);
          }}
        />
      ) : null}

      <ConfirmSheet
        visible={askYoutube !== null}
        onClose={() => setAskYoutube(null)}
        icon="image"
        title="Use YouTube’s suggested thumbnail?"
        body="You haven’t chosen a package. If you approve now, YouTube’s suggested thumbnail is used and the title is written for you."
        confirmLabel="Approve with YouTube’s"
        isConfirming={gate2Mutation.isPending}
        onConfirm={() => {
          const privacy = askYoutube?.privacy;
          setAskYoutube(null);
          gate2Mutation.mutate({ runId: run.id, action: 'approve', ...(flags.gate2Visibility && privacy ? { privacyStatus: privacy } : {}) } as Gate2Input);
        }}
      />
      <ConfirmSheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        icon="x-circle"
        title="Cancel this run?"
        body="The run will be marked as failed and won't continue. This can't be undone."
        confirmLabel="Cancel run"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate({ runId: run.id })}
      />
      <ConfirmSheet
        visible={confirmCancelRunning}
        onClose={() => setConfirmCancelRunning(false)}
        icon="x-circle"
        title="Cancel this run?"
        body="The current step stops and nothing is published."
        confirmLabel="Cancel run"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate({ runId: run.id })}
      />

      {isGate1 ? (
        <>
          <RepeatTopicBanner review={data.scriptReview} />
          <Card>
            <Text style={styles.cardTitle}>Script review</Text>
            {reviewScore !== undefined ? (
              <>
                <View style={styles.scoreRow}>
                  <Text style={styles.score}>{reviewScore}</Text>
                  <Text style={styles.scoreOf}>/10</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(0, Math.min(100, reviewScore * 10))}%`,
                        backgroundColor: reviewScore < 7 ? color.warnText : color.okText,
                      },
                    ]}
                  />
                </View>
              </>
            ) : null}
            {reviewNotes ? (
              <ClampedText
                lines={3}
                style={styles.body}
                text={reviewNotes}
                moreLabel="Read full review"
                lessLabel="Show less"
              />
            ) : null}
          </Card>
          <Gate1ReviewCards review={data.scriptReview} />
        </>
      ) : null}

      {decisionSent ? (
        <Card style={styles.darkCard}>
          <View style={styles.darkHeader}>
            <Feather name="check-circle" size={18} color={color.onAccent} />
            <Text style={styles.darkTitle}>{sentSummary ?? 'Decision sent'}</Text>
          </View>
          <Text style={styles.darkBody}>
            Decision sent. The pipeline is picking it up — this screen updates on its own.
          </Text>
          <IndeterminateBar />
          <Pressable
            onPress={() => setDecisionSentFor(null)}
            accessibilityRole="button"
            style={styles.answerAgain}
          >
            <Text style={styles.darkBody}>
              Still stuck after a few minutes? <Text style={styles.darkLink}>Answer again</Text>
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {isPublishing ? (
        <Card style={styles.darkCard}>
          <Text style={styles.darkTitle}>{isUploading ? 'Uploading to YouTube' : 'Uploaded — saving the first stats'}</Text>
          {lastGateDecision?.gate === 2 && lastGateDecision.outcome === 'approve' ? (
            <Text style={styles.darkBody}>
              You approved this video as {lastGateDecision.privacyStatus ?? 'private'}{' '}
              {relativeTime(lastGateDecision.decidedAt)}…
            </Text>
          ) : null}
          <IndeterminateBar />
          {isUploading ? (
            <Text style={styles.darkMeta}>
              Taking longer than 10 minutes moves this run to Needs attention automatically.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {isRevising ? (
        <Card style={styles.darkCard}>
          <Text style={styles.darkTitle}>Making the video again{regensUsed !== undefined ? ` · attempt ${regensUsed + 1}` : ''}</Text>
          {lastGateDecision?.notes ? (
            <Text style={styles.darkBody}>&quot;{lastGateDecision.notes}&quot;</Text>
          ) : null}
          {regensUsed !== undefined ? (
            <Text style={styles.darkMeta}>Regenerations used: {regensUsed} of {AUTO_REGEN_CAP}</Text>
          ) : null}
        </Card>
      ) : null}

      {showCancelledNotice ? (
        <Card>
          <StatusChip kind="ok" label="Run cancelled" />
        </Card>
      ) : null}

      {isEnded ? (
        <EndedCard
          endReason={endReason}
          rejectedGate={lastGateDecision?.gate}
          reason={lastGateDecision?.reason}
          lastError={run.lastError}
          spentUsd={data.spentUsd}
        />
      ) : null}

      {isRunningOrPending && !isRevising ? <InProgressCard runId={run.id} currentStage={run.currentStage} maxCostUsd={data.maxCostUsd} isLong={isLong} /> : null}

      {isPublished ? (
        <>
          <Pressable
            style={styles.openYoutube}
            onPress={() => void Linking.openURL(`https://youtu.be/${publishOutput?.youtubeVideoId}`)}
            accessibilityRole="link"
          >
            <Text style={styles.openYoutubeText}>Open on YouTube ↗</Text>
          </Pressable>
          {/* U10: the hint only makes sense until the first analytics poll (every 6h); after that it would be stale. */}
          {ageHours(run.completedAt ?? run.createdAt) < 6 ? (
            <Text style={styles.meta}>Views and likes show up on the Dashboard once the first poll runs.</Text>
          ) : null}
        </>
      ) : null}

      {isPublished ? (
        <Gate2Thumbnail thumbnail={thumbnailResult} apiUrl={apiUrl} token={token ?? ''} pictureUrl={thumbnailPictureUrl} />
      ) : null}

      {isPublished && isLong ? (
        <SubtitlesCard
          subtitlesUploaded={data.subtitlesUploaded}
          subtitlesMessage={data.subtitlesMessage}
          subtitlesUrl={data.subtitlesUrl}
          apiUrl={apiUrl}
        />
      ) : null}

      {isGate2 ? (
        <Card>
          <View style={styles.reviewHeader}>
            <Text style={styles.cardTitle}>Video review</Text>
            {videoPassed !== undefined ? <StatusChip kind={videoPassed ? 'ok' : 'failed'} label={videoPassed ? 'Passed' : 'Failed'} /> : null}
          </View>
          {videoRationale ? (
            <ClampedText lines={3} style={styles.meta} text={videoRationale} moreLabel="Read full review" lessLabel="Show less" />
          ) : null}
          {regensUsed !== undefined ? (
            <Text style={styles.meta}>Regenerations used: {regensUsed} of {AUTO_REGEN_CAP}</Text>
          ) : null}
          {isLong && chapterWarningOf(data) ? (
            <View style={styles.chapterWarning}>
              <Text style={styles.chapterWarningText}>Chapters won&apos;t be added to the description: {chapterWarningOf(data)}.</Text>
            </View>
          ) : null}
          <QualityChecksCard embedded qualityMetrics={data.qualityMetrics} />
        </Card>
      ) : null}

      {isGate2 && gate2Kind !== 'none' ? (
        <Gate2Packages
          response={gate2Response}
          channelName={channel?.name ?? 'Your channel'}
          apiUrl={apiUrl}
          token={token ?? ''}
          editable={isGate2 && !decisionSent}
          choosing={chooseMutation.isPending}
          chooseError={editingPackage ? null : (chooseMutation.error?.message ?? null)}
          onChoose={(packageId) => chooseMutation.mutate({ runId: run.id, packageId })}
          onEdit={(p) => {
            chooseMutation.reset();
            setEditingPackage(p);
          }}
        />
      ) : null}
      <EditTitleScreen
        visible={editingPackage !== null}
        pkg={editingPackage}
        index={Math.max(0, gate2View?.packages.findIndex((p) => p.id === editingPackage?.id) ?? 0)}
        initialTitle={editingPackage ? (gate2View?.choice?.packageId === editingPackage.id && gate2View.choice.title ? gate2View.choice.title : editingPackage.title) : ''}
        titleLimit={gate2View?.titleLimit ?? 0}
        checkTitle={checkTitle}
        saving={chooseMutation.isPending}
        saveError={chooseMutation.error?.message ?? null}
        apiUrl={apiUrl}
        token={token ?? ''}
        onClose={() => setEditingPackage(null)}
        onSave={(title) =>
          chooseMutation.mutate({ runId: run.id, packageId: editingPackage!.id, editedTitle: title }, { onSuccess: () => setEditingPackage(null) })
        }
      />

      {data.spentUsd !== undefined ? (
        <CostCard
          spentUsd={costs?.totalUsd ?? data.spentUsd}
          limitUsd={costs?.limitUsd ?? data.maxCostUsd}
          estimateUsd={costs?.estimateUsd}
          retryAllowanceUsd={costs?.retryAllowanceUsd}
          breakdown={costs}
          ended={run.status === 'completed' || run.status === 'failed'}
          attemptsCount={videoAttempts}
          noLimitByDesign={!isLong}
          packagingLine={gate2Kind === 'making' ? packagingCostLine(gate2View?.packagingCostUsd, gate2View?.round) : null}
        />
      ) : null}

      <RunTabs value={tab} onChange={setTabChoice} />
      <Card key={tab}>
        {tab === 'brief' ? (
          <>
            <Text style={styles.cardMeta}>What you asked for · {startedLabel(run.createdAt)}</Text>
            <ClampedText lines={5} style={styles.body} text={run.briefText} moreLabel="Show more" lessLabel="Show less" />
          </>
        ) : tab === 'script' ? (
          <ScriptVersionsCard versions={scriptVersions} isLong={isLong} reviewScore={reviewScore} showReviewScore={!isGate1} />
        ) : (
          isLong && (isGate2 || data.previewUrl) ? (
            <LongPreview previewUrl={data.previewUrl} apiUrl={apiUrl} token={token ?? ''} chapters={approvedChapters ?? chapters} lengthLabel={lengthLabel} />
          ) : isGate2 ? (
            <View style={styles.videoRow}>
              {videoSource ? (
                <VideoView style={styles.video} player={player} nativeControls />
              ) : (
                <View style={[styles.video, styles.videoLoading]}>
                  <ActivityIndicator color={color.onAccent} />
                </View>
              )}
              <View style={styles.videoInfo}>
                <Text style={styles.cardTitle}>Draft video</Text>
                <Text style={styles.meta}>Tap the video to play it, then decide below.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.videoInfo}>
              <Text style={styles.cardTitle}>Video</Text>
              {videoPassed !== undefined ? (
                <StatusChip kind={videoPassed ? 'ok' : 'failed'} label={videoPassed ? 'Review passed' : 'Review failed'} />
              ) : (
                <Text style={styles.cardMeta}>No video review yet.</Text>
              )}
              {videoRationale ? (
                <ClampedText lines={3} style={styles.meta} text={videoRationale} moreLabel="Read full review" lessLabel="Show less" />
              ) : null}
              {regensUsed !== undefined ? (
                <Text style={styles.meta}>Regenerations used: {regensUsed} of {AUTO_REGEN_CAP}</Text>
              ) : null}
            </View>
          )
        )}
      </Card>

      {/* One history (Sprint 5 Task 7 R11.2): the old Details list is folded into it. */}
      <StepHistory steps={history.steps} summary={history.summary} notes={historyNotes} />

      {showPostHoc ? <PostHocTagForm runId={run.id} reviewLogs={data.reviewLogs} failed={run.status === 'failed'} /> : null}
    </FormScreen>
  );
}

// Every existing tag is a plain ReviewLog row (agent: 'founder-post-hoc');
// shown as history, never replaced — the old Telegram flow never prevented
// tagging a run more than once either.
function PostHocTagForm({ runId, reviewLogs, failed }: { runId: string; reviewLogs: ReviewLogRow[]; failed: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState('');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);

  const existingTags = reviewLogs
    .filter((log) => log.agent === FOUNDER_POST_HOC_AGENT)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const tagMutation = useMutation(
    trpc.runs.tagPostHoc.mutationOptions({
      onSuccess: async () => {
        setTag('');
        setNotes('');
        await queryClient.invalidateQueries({ queryKey: trpc.runs.get.queryKey({ id: runId }) });
      },
    }),
  );

  const handleSubmit = () => {
    if (!tag.trim()) return;
    tagMutation.mutate({ runId, tag: tag.trim(), notes: notes.trim() || undefined });
  };

  return (
    <View>
      <Pressable
        style={styles.tagHeader}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.tagHeaderTitle}>
          {failed ? 'Tag why this run failed' : 'Tag why this video underperformed'} <Text style={styles.tagHeaderHint}>· optional</Text>
        </Text>
        <Text style={styles.tagHeaderHint}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
    <Card>
      {existingTags.map((log) => (
        <Text key={log.id} style={styles.meta}>
          {tagLabel(log.verdict)}
          {log.rationale && log.rationale !== log.verdict ? ` — ${log.rationale}` : ''} ({relativeTime(log.timestamp)})
        </Text>
      ))}
      <View style={styles.chipRow}>
        {POST_HOC_TAGS.map((suggestion) => (
          <Pressable key={suggestion.key} style={[styles.chip, tag === suggestion.key && styles.chipActive]} onPress={() => setTag(suggestion.key)} accessibilityRole="button">
            <Text style={styles.chipText}>{suggestion.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={styles.input}
        value={tag}
        onChangeText={setTag}
        placeholder="Tag (e.g. weak_hook) — free text"
        placeholderTextColor={color.muted}
        autoCapitalize="none"
      />
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={styles.input}
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes (optional)"
        placeholderTextColor={color.muted}
      />
      {tagMutation.error ? <Text style={styles.errorText}>{tagMutation.error.message}</Text> : null}
      <PrimaryButton
        label="Submit tag"
        onPress={handleSubmit}
        loading={tagMutation.isPending}
        disabled={!tag.trim()}
      />
    </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  loadErrorActions: { width: '100%', gap: space.sm },
  errorText: { ...type.body, color: color.danger },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chipMeta: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  runTitle: { fontFamily: font.black, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, color: color.ink },
  cardMeta: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: color.muted },
  statusPending: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.warnText },
  statusDone: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.ink },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  editSettings: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, alignSelf: 'flex-start' },
  editSettingsText: { fontFamily: font.black, fontSize: 14, color: color.accentText },
  scriptHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  body: { ...type.body, color: color.ink },
  meta: { ...type.meta },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  score: { ...type.stat, color: color.ink },
  scoreOf: { ...type.body, color: color.muted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chapterWarning: { backgroundColor: color.warnBg, borderRadius: radius.md, padding: space.md },
  chapterWarningText: { fontFamily: font.semibold, fontSize: 13, lineHeight: 19, color: color.warnText },
  videoRow: { flexDirection: 'row', gap: space.md },
  video: { width: 118, height: 210, borderRadius: radius.sm, backgroundColor: color.video },
  videoLoading: { alignItems: 'center', justifyContent: 'center' },
  videoInfo: { flex: 1, gap: space.sm },
  raw: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  rawFailed: { color: color.danger },
  failedWhy: { gap: 2, paddingLeft: space.sm, paddingVertical: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: color.surface2, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  chipActive: { backgroundColor: color.accentSoft },
  tagHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: color.border },
  tagHeaderTitle: { fontFamily: font.black, fontSize: 15, color: color.ink },
  tagHeaderHint: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  chipText: { fontFamily: font.semibold, fontSize: 12, color: color.ink },
  input: {
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...type.body,
    color: color.ink,
  },
  darkCard: { backgroundColor: color.ink, borderColor: color.ink },
  darkHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  darkTitle: { fontFamily: font.bold, fontSize: 15, color: color.onAccent },
  darkBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)' },
  darkMeta: { fontFamily: font.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  darkLink: { fontFamily: font.bold, color: color.onAccent },
  answerAgain: { alignSelf: 'center', marginTop: space.xs },
  openYoutube: {
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openYoutubeText: { fontFamily: font.bold, fontSize: 15, color: color.onAccent },
});

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Pressable, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTRPC } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useChannels } from '../../../lib/channel-context';
import { useAuthedVideoSource } from '../../../lib/use-video-source';
import { flags } from '../../../lib/feature-flags';
import { humanizeRunError, relativeTime, statusChipKind, statusLabel, stepperIndexForStage } from '../../../lib/run-labels';
import { color, font, radius, space, type } from '../../../lib/theme';
import { FormScreen } from '../../../components/FormScreen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { Stepper } from '../../../components/Stepper';
import { BottomActionBar } from '../../../components/BottomActionBar';
import { GateActionBar, type Privacy } from '../../../components/GateActionBar';
import { ClampedText } from '../../../components/ClampedText';
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

// No fixed tag vocabulary is enforced server-side (Backend Task 7/O4); these
// are quick-pick suggestions only, free text is always accepted.
const SUGGESTED_TAGS = ['weak_hook', 'topic_already_saturated', 'bad_thumbnail_frame'];
const FOUNDER_POST_HOC_AGENT = 'founder-post-hoc';

type Stage = {
  id: string;
  stageName: string;
  status: string;
  attemptNumber: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
};

// Bugs Closure R5 — the raw status read "completed" next to a failed attempt in the list;
// say plainly what each row is, and make a failed one visibly failed.
const STAGE_STATUS_LABEL: Record<string, string> = {
  completed: 'done',
  failed: 'FAILED',
  skipped: 'skipped (not run)',
  running: 'in progress',
  pending: 'waiting',
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
  const [showDetails, setShowDetails] = useState(false);

  // Bugs Task 9 (R3) — the gate attempt a decision was just sent for. Its
  // buttons stay hidden (and the screen keeps polling) until the run moves on,
  // so a second tap can no longer hit "Gate N is not currently pending".
  const [decisionSentFor, setDecisionSentFor] = useState<string | null>(null);
  // Task 6/E2 — what the decision-sent card should say; derived once at
  // submit time from the mutation's own variables.
  const [sentSummary, setSentSummary] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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
  // Bugs Task 7 (R3) — the way out of needs_attention. Also used for E5
  // (cancel while running/pending) — same endpoint, different confirm copy
  // and follow-up UI since a running cancel isn't guaranteed synchronous.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const retryMutation = useMutation(trpc.runs.retry.mutationOptions({ onSuccess: () => invalidate() }));
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
    () => (apiUrl && data ? `${apiUrl.replace(/\/$/, '')}/runs/${data.run.id}/video` : null),
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
    | { youtubeVideoId?: string; privacyStatus?: string; metadata?: { title?: string } }
    | undefined;

  const scriptText = (scriptGenStage?.output?.scriptText as string | undefined) ?? '';
  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const approxSec = wordCount > 0 ? Math.round(wordCount / 2.5) : undefined;
  const reviewScore = scriptReviewStage?.output?.score as number | undefined;
  const reviewNotes = scriptReviewStage?.output?.notes as string | undefined;
  const videoVerdict = videoReviewStage?.output?.verdict as string | undefined;
  const videoRationale = videoReviewStage?.output?.rationale as string | undefined;
  const videoPassed = videoVerdict === 'pass' ? true : videoVerdict === 'fail' ? false : undefined;
  const videoAttempts = stages.filter((s) => s.stageName === 'video_generation').length;
  const regensUsed = videoAttempts > 0 ? videoAttempts - 1 : undefined;

  const isGate1 = run.status === 'paused_gate1';
  const isGate2 = run.status === 'paused_gate2';
  const isNeedsAttention = run.status === 'needs_attention';
  const currentStage = isGate1 ? 'gate1' : isGate2 ? 'gate2' : run.currentStage;
  const stepIndex = run.status === 'completed' ? 7 : stepperIndexForStage(currentStage);

  const defaultPrivacy: Privacy | undefined = channel?.defaultPrivacyStatus;

  const openGateStage = isGate1 ? latestStage(stages, 'gate1') : isGate2 ? latestStage(stages, 'gate2') : undefined;
  const decisionSent = decisionSentFor !== null && decisionSentFor === openGateStage?.id;

  // Task 6/E3 — B13's lastGateDecision/endReason tell us which of the three
  // post-Gate-2 outcomes we're in; B14 means "approved" really does drive
  // straight to publishing on the live server now, no restart needed.
  const { lastGateDecision, endReason } = data;
  const isEnded = run.status === 'failed';
  const isPublishing = run.status === 'running' && run.currentStage === 'publishing';
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

  const cancelRequested = data.cancelRequested;
  const cancelling = cancelMutation.isPending || (cancelRequested && !cancelTimedOut);

  const footer =
    (isGate1 || isGate2) && !decisionSent ? (
      <BottomActionBar onHeight={setBarHeight}>
        <GateActionBar
          key={run.id + run.status}
          gate={isGate1 ? 1 : 2}
          isSubmitting={isGate1 ? gate1Mutation.isPending : gate2Mutation.isPending}
          initialEditText={scriptText}
          defaultPrivacy={defaultPrivacy}
          onApprove={(privacy) => {
            if (isGate1) gate1Mutation.mutate({ runId: run.id, action: 'approve' });
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
          disabled={cancelMutation.isPending}
          onPress={() => retryMutation.mutate({ runId: run.id })}
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
      ? gate1Mutation.error
      : isGate2
        ? gate2Mutation.error
        : (retryMutation.error ?? (isRunningOrPending ? null : cancelMutation.error))
  )?.message;

  return (
    <FormScreen
      variant="stack"
      title="Run"
      subtitle={`${channel?.name ?? 'Deleted channel'} · started ${relativeTime(run.createdAt)}`}
      contentContainerStyle={[styles.content, { paddingBottom: barHeight + space.xl }]}
      footer={footer}
    >
      <StatusChip kind={statusChipKind(run.status)} label={statusLabel(run.status)} />

      <View style={styles.brief}>
        <Text style={styles.briefLabel}>Brief</Text>
        <Text style={styles.briefText}>{run.briefText}</Text>
      </View>

      <Card>
        <Stepper currentIndex={stepIndex} attention={isNeedsAttention} />
      </Card>

      {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}

      {isNeedsAttention ? (
        <Card>
          <View style={styles.warnHeader}>
            <View style={styles.warnIconTile}>
              <Feather name="alert-triangle" size={18} color={color.warnText} />
            </View>
            <Text style={styles.warnTitle}>What went wrong</Text>
          </View>
          <Text style={styles.body}>
            {humanizeRunError(run.lastError) || 'This run stopped and needs a decision.'}
            {run.currentStage ? <Text style={styles.meta}> (at {run.currentStage.replace(/_/g, ' ')})</Text> : null}
          </Text>
          <Text style={styles.meta}>
            Retry runs this step again from scratch. Cancel stops the run for good — nothing is published.
          </Text>
          {run.lastError ? (
            <>
              <Pressable
                style={styles.detailsToggle}
                onPress={() => setShowTechnicalDetails((v) => !v)}
                accessibilityRole="button"
              >
                <Text style={styles.detailsToggleText}>Technical details</Text>
                <Feather
                  name={showTechnicalDetails ? 'chevron-down' : 'chevron-right'}
                  size={16}
                  color={color.muted}
                />
              </Pressable>
              {showTechnicalDetails ? <Text style={styles.raw}>{run.lastError}</Text> : null}
            </>
          ) : null}
        </Card>
      ) : null}

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
          <Card>
            <View style={styles.scriptHeader}>
              <Text style={styles.cardTitle}>Script</Text>
              {approxSec !== undefined ? (
                <Text style={styles.meta}>
                  ~{approxSec} sec · {wordCount} words
                </Text>
              ) : null}
            </View>
            <ClampedText
              lines={6}
              style={styles.body}
              text={scriptText}
              moreLabel="Show full script"
              lessLabel="Show less"
            />
          </Card>
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
          <Text style={styles.darkTitle}>Uploading to YouTube</Text>
          {lastGateDecision?.gate === 2 && lastGateDecision.outcome === 'approve' ? (
            <Text style={styles.darkBody}>
              You approved this video as {lastGateDecision.privacyStatus ?? 'private'}{' '}
              {relativeTime(lastGateDecision.decidedAt)}…
            </Text>
          ) : null}
          <IndeterminateBar />
          <Text style={styles.darkMeta}>
            Taking longer than 10 minutes moves this run to Needs attention automatically.
          </Text>
        </Card>
      ) : null}

      {isRevising ? (
        <Card style={styles.darkCard}>
          <Text style={styles.darkTitle}>Making the video again{regensUsed !== undefined ? ` · attempt ${regensUsed + 1}` : ''}</Text>
          {lastGateDecision?.notes ? (
            <Text style={styles.darkBody}>&quot;{lastGateDecision.notes}&quot;</Text>
          ) : null}
          {regensUsed !== undefined ? (
            <Text style={styles.darkMeta}>Regenerations used: {regensUsed} of 2</Text>
          ) : null}
        </Card>
      ) : null}

      {showCancelledNotice ? (
        <Card>
          <StatusChip kind="ok" label="Run cancelled" />
        </Card>
      ) : null}

      {isEnded ? (
        <Card>
          {endReason === 'rejected' ? (
            <>
              <StatusChip kind="failed" label={`Rejected at Gate ${lastGateDecision?.gate ?? '?'}`} />
              <Text style={styles.body}>
                You rejected this {lastGateDecision?.gate === 1 ? 'script' : 'video'}
                {lastGateDecision?.reason ? `: "${lastGateDecision.reason}"` : '.'}
              </Text>
              <Text style={styles.meta}>Nothing was published.</Text>
            </>
          ) : endReason === 'cancelled' ? (
            <>
              <StatusChip kind="failed" label="Cancelled" />
              <Text style={styles.body}>You cancelled this run. Nothing was published.</Text>
            </>
          ) : (
            <>
              <StatusChip kind="failed" label="Failed" />
              <Text style={styles.body}>This run stopped.</Text>
              {run.lastError ? <Text style={styles.meta}>{humanizeRunError(run.lastError)}</Text> : null}
            </>
          )}
        </Card>
      ) : null}

      {isPublished ? (
        <Card style={styles.publishedCard}>
          <View style={styles.publishedHeader}>
            <View style={styles.publishedIconTile}>
              <Feather name="play" size={18} color={color.okText} />
            </View>
            <Text style={styles.cardTitle}>Published to YouTube</Text>
          </View>
          {publishOutput?.metadata?.title ? <Text style={styles.body}>{publishOutput.metadata.title}</Text> : null}
          <View style={styles.publishedChips}>
            <StatusChip kind="neutral" label={publishOutput?.privacyStatus ?? 'unknown'} />
            <StatusChip kind="neutral" label={`Uploaded ${relativeTime(run.completedAt ?? run.createdAt)}`} />
          </View>
          <Pressable
            style={styles.openYoutube}
            onPress={() => void Linking.openURL(`https://youtu.be/${publishOutput?.youtubeVideoId}`)}
            accessibilityRole="link"
          >
            <Text style={styles.openYoutubeText}>Open on YouTube ↗</Text>
          </Pressable>
          <Text style={styles.meta}>Views and likes show up on the Dashboard once the first poll runs.</Text>
        </Card>
      ) : null}

      {isGate2 ? (
        <Card>
          <View style={styles.videoRow}>
            {videoSource ? (
              <VideoView style={styles.video} player={player} nativeControls />
            ) : (
              <View style={[styles.video, styles.videoLoading]}>
                <ActivityIndicator color={color.onAccent} />
              </View>
            )}
            <View style={styles.videoInfo}>
              <Text style={styles.cardTitle}>Video review</Text>
              {videoPassed !== undefined ? (
                <StatusChip kind={videoPassed ? 'ok' : 'failed'} label={videoPassed ? 'Passed' : 'Failed'} />
              ) : null}
              {videoRationale ? <ClampedText lines={3} style={styles.meta} text={videoRationale} /> : null}
              {regensUsed !== undefined ? (
                <Text style={styles.meta}>Regenerations used: {regensUsed} of 2</Text>
              ) : null}
            </View>
          </View>
        </Card>
      ) : null}

      <Pressable style={styles.detailsToggle} onPress={() => setShowDetails((v) => !v)} accessibilityRole="button">
        <Text style={styles.detailsToggleText}>Details</Text>
        <Feather name={showDetails ? 'chevron-down' : 'chevron-right'} size={18} color={color.muted} />
      </Pressable>
      {showDetails ? (
        <Card>
          {run.lastError ? <Text style={styles.raw}>{run.lastError}</Text> : null}
          {stages.map((s) => (
            <Text key={s.id} style={[styles.raw, s.status === 'failed' && styles.rawFailed]}>
              {s.stageName.replace(/_/g, ' ')} · attempt {s.attemptNumber} · {STAGE_STATUS_LABEL[s.status] ?? s.status}
            </Text>
          ))}
        </Card>
      ) : null}

      {run.status === 'completed' || run.status === 'failed' ? (
        <PostHocTagForm runId={run.id} reviewLogs={data.reviewLogs} />
      ) : null}
    </FormScreen>
  );
}

// Every existing tag is a plain ReviewLog row (agent: 'founder-post-hoc');
// shown as history, never replaced — the old Telegram flow never prevented
// tagging a run more than once either.
function PostHocTagForm({ runId, reviewLogs }: { runId: string; reviewLogs: ReviewLogRow[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState('');
  const [notes, setNotes] = useState('');

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
    <Card>
      <Text style={styles.cardTitle}>Post-hoc tag</Text>
      {existingTags.map((log) => (
        <Text key={log.id} style={styles.meta}>
          {log.verdict}
          {log.rationale && log.rationale !== log.verdict ? ` — ${log.rationale}` : ''} ({relativeTime(log.timestamp)})
        </Text>
      ))}
      <View style={styles.chipRow}>
        {SUGGESTED_TAGS.map((suggestion) => (
          <Pressable key={suggestion} style={styles.chip} onPress={() => setTag(suggestion)}>
            <Text style={styles.chipText}>{suggestion}</Text>
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
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  loadErrorActions: { width: '100%', gap: space.sm },
  errorText: { ...type.body, color: color.danger },
  brief: { gap: 2 },
  briefLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  briefText: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24, color: color.ink },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  scriptHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  body: { ...type.body, color: color.ink },
  meta: { ...type.meta },
  link: { ...type.bodyStrong, color: color.accentText },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  score: { ...type.stat, color: color.ink },
  scoreOf: { ...type.body, color: color.muted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  videoRow: { flexDirection: 'row', gap: space.md },
  video: { width: 118, height: 210, borderRadius: radius.sm, backgroundColor: color.video },
  videoLoading: { alignItems: 'center', justifyContent: 'center' },
  videoInfo: { flex: 1, gap: space.sm },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  detailsToggleText: { ...type.sectionTitle, color: color.muted },
  raw: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  rawFailed: { color: color.danger },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: color.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
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
  warnHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  warnIconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: color.warnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnTitle: { fontFamily: font.black, fontSize: 16, color: color.ink },
  darkCard: { backgroundColor: color.ink, borderColor: color.ink },
  darkHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  darkTitle: { fontFamily: font.bold, fontSize: 15, color: color.onAccent },
  darkBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)' },
  darkMeta: { fontFamily: font.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  darkLink: { fontFamily: font.bold, color: color.onAccent },
  answerAgain: { alignSelf: 'center', marginTop: space.xs },
  publishedCard: { borderWidth: 2, borderColor: color.okText },
  publishedHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  publishedIconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: color.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishedChips: { flexDirection: 'row', gap: space.sm },
  openYoutube: {
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openYoutubeText: { fontFamily: font.bold, fontSize: 15, color: color.onAccent },
});

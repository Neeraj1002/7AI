import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
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
import { PrimaryButton, SecondaryButton } from '../../../components/Buttons';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import type { AppRouter } from '../../../../studio/src/api/router';

type ReviewLogRow = inferRouterOutputs<AppRouter>['runs']['get']['reviewLogs'][number];

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

  const { data, isLoading, error } = useQuery(trpc.runs.get.queryOptions({ id: id! }));

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.runs.get.queryKey({ id: id! }) }),
      queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() }),
    ]);

  const gate1Mutation = useMutation(trpc.runs.gate1.mutationOptions({ onSuccess: () => invalidate() }));
  const gate2Mutation = useMutation(trpc.runs.gate2.mutationOptions({ onSuccess: () => invalidate() }));
  // Bugs Task 7 (R3) — the way out of needs_attention.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const retryMutation = useMutation(trpc.runs.retry.mutationOptions({ onSuccess: () => invalidate() }));
  const cancelMutation = useMutation(
    trpc.runs.cancel.mutationOptions({
      onSuccess: () => {
        setConfirmCancel(false);
        return invalidate();
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

  if (isLoading || error || !data) {
    return (
      <FormScreen variant="stack" title="Run">
        <View style={styles.center}>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.errorText}>{error?.message ?? 'Run not found'}</Text>
          )}
        </View>
      </FormScreen>
    );
  }

  const { run, stages } = data;
  const channel = channelById(run.channelId);
  const scriptGenStage = latestStage(stages, 'script_generation');
  const scriptReviewStage = latestStage(stages, 'script_review');
  const videoReviewStage = latestStage(stages, 'video_review');

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

  const defaultPrivacy = (channel as { defaultPrivacyStatus?: Privacy } | undefined)?.defaultPrivacyStatus;

  const footer =
    isGate1 || isGate2 ? (
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
              const input = { runId: run.id, action: 'approve' as const };
              gate2Mutation.mutate(flags.gate2Visibility && privacy ? ({ ...input, privacyStatus: privacy } as typeof input) : input);
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
        <SecondaryButton
          label="Cancel run"
          icon="x"
          disabled={retryMutation.isPending || cancelMutation.isPending}
          onPress={() => setConfirmCancel(true)}
        />
      </BottomActionBar>
    ) : null;

  const mutationError = (
    isGate1 ? gate1Mutation.error : isGate2 ? gate2Mutation.error : (retryMutation.error ?? cancelMutation.error)
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
        <Stepper currentIndex={stepIndex} />
      </Card>

      {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}

      {isNeedsAttention ? (
        <Card>
          <Text style={styles.cardTitle}>What went wrong</Text>
          <Text style={styles.body}>
            {humanizeRunError(run.lastError) || 'This run stopped and needs a decision.'}
            {run.currentStage ? ` (at ${run.currentStage.replace(/_/g, ' ')})` : ''}
          </Text>
          {run.lastError ? <Text style={styles.raw}>{run.lastError}</Text> : null}
          <Text style={styles.meta}>
            Retry runs this step again from scratch. Cancel stops the run for good.
          </Text>
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
            {reviewNotes ? <Text style={styles.body}>{reviewNotes}</Text> : null}
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Script</Text>
            {approxSec !== undefined ? <Text style={styles.meta}>~{approxSec} sec (approx.)</Text> : null}
            <Text style={styles.body}>{scriptText}</Text>
          </Card>
        </>
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
              {videoRationale ? <Text style={styles.meta}>{videoRationale}</Text> : null}
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
            <Text key={s.id} style={styles.raw}>
              {s.stageName} · attempt {s.attemptNumber} · {s.status}
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
        style={styles.input}
        value={tag}
        onChangeText={setTag}
        placeholder="Tag (e.g. weak_hook) — free text"
        placeholderTextColor={color.muted}
        autoCapitalize="none"
      />
      <TextInput
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  errorText: { ...type.body, color: color.danger },
  brief: { gap: 2 },
  briefLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  briefText: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24, color: color.ink },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  body: { ...type.body, color: color.ink },
  meta: { ...type.meta },
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
});

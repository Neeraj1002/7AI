import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTRPC } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useAuthedVideoSource } from '../../../lib/use-video-source';
import { GateActionBar } from '../../../components/GateActionBar';

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

// Run Detail — one screen, sectioned by whichever gate is active (confirmed
// design, MOBILE_APP_DESIGN.md Section 4, 2026-09-09 note): brief + stage
// history always shown; a Script Review section OR a Video Review section
// renders below depending on run.status, never both — a run is only ever
// paused at one gate at a time. A gate already passed collapses to a
// read-only summary rather than disappearing, so the full history stays on
// one screen.
export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { token, apiUrl } = useAuth();

  const { data, isLoading, error } = useQuery(trpc.runs.get.queryOptions({ id: id! }));

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.runs.get.queryKey({ id: id! }) }),
      queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() }),
    ]);

  const gate1Mutation = useMutation(
    trpc.runs.gate1.mutationOptions({ onSuccess: () => invalidate() }),
  );
  const gate2Mutation = useMutation(
    trpc.runs.gate2.mutationOptions({ onSuccess: () => invalidate() }),
  );

  const videoUrl = useMemo(
    () => (apiUrl && data ? `${apiUrl.replace(/\/$/, '')}/runs/${data.run.id}/video` : null),
    [apiUrl, data],
  );
  const videoSource = useAuthedVideoSource(
    data?.run.status === 'paused_gate2' ? videoUrl : null,
    token ?? '',
  );
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error?.message ?? 'Run not found'}</Text>
      </View>
    );
  }

  const { run, stages } = data;
  const scriptGenStage = latestStage(stages, 'script_generation');
  const scriptReviewStage = latestStage(stages, 'script_review');
  const gate1Stage = latestStage(stages, 'gate1');
  const videoReviewStage = latestStage(stages, 'video_review');
  const gate2Stage = latestStage(stages, 'gate2');

  const scriptText = (scriptGenStage?.output?.scriptText as string | undefined) ?? '';
  const reviewScore = scriptReviewStage?.output?.score as number | undefined;
  const reviewNotes = scriptReviewStage?.output?.notes as string | undefined;
  const videoVerdict = videoReviewStage?.output?.verdict as string | undefined;
  const videoRationale = videoReviewStage?.output?.rationale as string | undefined;

  const gate1Passed = gate1Stage?.status === 'completed';
  const gate2Passed = gate2Stage?.status === 'completed';
  const gate1Outcome = gate1Stage?.output?.outcome as string | undefined;
  const gate2Outcome = gate2Stage?.output?.outcome as string | undefined;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.statusBadge}>{run.status}</Text>
      <Text style={styles.sectionTitle}>Brief</Text>
      <Text style={styles.body}>{run.briefText}</Text>
      {run.lastError ? <Text style={styles.errorText}>{run.lastError}</Text> : null}

      <Text style={styles.sectionTitle}>Stage history</Text>
      <View style={styles.historyList}>
        {stages.map((s) => (
          <Text key={s.id} style={styles.historyRow}>
            {s.stageName} · attempt {s.attemptNumber} · {s.status}
          </Text>
        ))}
      </View>

      {/* Gate 1 — active while paused_gate1, otherwise a read-only summary once passed */}
      {run.status === 'paused_gate1' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gate 1 — Script Review</Text>
          <Text style={styles.body}>{scriptText}</Text>
          {reviewScore !== undefined ? (
            <Text style={styles.meta}>
              Script Review score: {reviewScore}/10 — {reviewNotes}
            </Text>
          ) : null}
          <GateActionBar
            editFieldLabel="Edited script text (or notes for regeneration)"
            isSubmitting={gate1Mutation.isPending}
            onApprove={() => gate1Mutation.mutate({ runId: run.id, action: 'approve' })}
            onReject={(reason) => gate1Mutation.mutate({ runId: run.id, action: 'reject', reason })}
            onEditOrRevise={(text) =>
              gate1Mutation.mutate({ runId: run.id, action: 'edit', editedScriptText: text })
            }
          />
          {gate1Mutation.error ? <Text style={styles.errorText}>{gate1Mutation.error.message}</Text> : null}
        </View>
      ) : gate1Passed ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gate 1 (passed)</Text>
          <Text style={styles.meta}>Outcome: {gate1Outcome}</Text>
        </View>
      ) : null}

      {/* Gate 2 — active while paused_gate2, otherwise a read-only summary once passed */}
      {run.status === 'paused_gate2' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gate 2 — Video Review</Text>
          {videoSource ? (
            <VideoView style={styles.video} player={player} nativeControls />
          ) : (
            <Text style={styles.meta}>Loading video…</Text>
          )}
          {videoVerdict ? (
            <Text style={styles.meta}>
              Video Intelligence verdict: {videoVerdict} — {videoRationale}
            </Text>
          ) : null}
          <GateActionBar
            editFieldLabel="Revision notes"
            isSubmitting={gate2Mutation.isPending}
            onApprove={() => gate2Mutation.mutate({ runId: run.id, action: 'approve' })}
            onReject={(reason) => gate2Mutation.mutate({ runId: run.id, action: 'reject', reason })}
            onEditOrRevise={(notes) => gate2Mutation.mutate({ runId: run.id, action: 'revise', notes })}
          />
          {gate2Mutation.error ? <Text style={styles.errorText}>{gate2Mutation.error.message}</Text> : null}
        </View>
      ) : gate2Passed ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gate 2 (passed)</Text>
          <Text style={styles.meta}>Outcome: {gate2Outcome}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: '#eee',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12, color: '#555', marginTop: 6 },
  errorText: { color: '#c00', marginTop: 6 },
  historyList: { gap: 2 },
  historyRow: { fontSize: 12, color: '#666' },
  card: { marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: '#f7f7f7', gap: 8 },
  video: { width: '100%', height: 320, backgroundColor: '#000', borderRadius: 8 },
});

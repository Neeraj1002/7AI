import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTRPC } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useAuthedVideoSource } from '../../../lib/use-video-source';
import { GateActionBar } from '../../../components/GateActionBar';
import type { AppRouter } from '../../../../studio/src/api/router';

type ReviewLogRow = inferRouterOutputs<AppRouter>['runs']['get']['reviewLogs'][number];

// Backend Task 7/O4's post-hoc-tag.ts is explicit: "No fixed tag vocabulary
// is enforced, by design... a solo founder typing their own words is the
// actual 'cheap' this task asks for, not a rigid enum to memorize" —
// confirmed by reading that file directly rather than assuming the frontend
// task spec's "a tag picker constrained to [a] real tag vocabulary" framing
// was accurate (it wasn't: there is no server-side vocabulary to read). The
// design doc's own illustrative examples become quick-pick suggestions
// here, not an enforced list — free text is always accepted underneath.
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
    // Bugs Task 3 (R4) — same KeyboardAvoidingView pattern as login.tsx/
    // new-brief.tsx: this screen's GateActionBar (reject/edit text) and
    // PostHocTagForm (tag/notes) fields can both end up near the bottom of a
    // long scroll, exactly where an unhandled keyboard would cover them.
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

      {/* Post-hoc tagging (FE12) — only once a run has reached a terminal
          state, matching the same status values this screen already checks
          elsewhere (no new status vocabulary). */}
      {run.status === 'completed' || run.status === 'failed' ? (
        <PostHocTagForm runId={run.id} reviewLogs={data.reviewLogs} />
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Backend Task 7/O4's own verification bar: the identical DB row shape the
// old Telegram `tag <runId> <word> [notes]` command used to produce. Every
// existing tag is a plain ReviewLog row (agent: 'founder-post-hoc') — shown
// here as history, not replaced on a new submission, since the old flow
// never prevented tagging the same run more than once either (confirmed by
// reading post-hoc-tag.ts: it always inserts a new row, no existing-tag
// check) — this form doesn't silently add a restriction that wasn't there
// before.
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
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Post-hoc tag</Text>

      {existingTags.length > 0 ? (
        <View style={styles.tagHistory}>
          {existingTags.map((log) => (
            <Text key={log.id} style={styles.meta}>
              {log.verdict}
              {log.rationale && log.rationale !== log.verdict ? ` — ${log.rationale}` : ''} (
              {new Date(log.timestamp).toLocaleString()})
            </Text>
          ))}
        </View>
      ) : null}

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
        placeholder="Tag (e.g. weak_hook) — free text, no fixed list"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes (optional)"
      />

      {tagMutation.error ? <Text style={styles.errorText}>{tagMutation.error.message}</Text> : null}

      <Pressable
        style={[styles.tagButton, (tagMutation.isPending || !tag.trim()) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={tagMutation.isPending || !tag.trim()}
      >
        {tagMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.tagButtonText}>Submit tag</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  tagHistory: { gap: 2, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  tagButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  tagButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

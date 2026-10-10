import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../../../lib/trpc';
import { flags } from '../../../lib/feature-flags';
import { relativeTime, runTopic } from '../../../lib/run-labels';
import { color, font, space, type } from '../../../lib/theme';
import { Screen } from '../../../components/Screen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { GateActionBar } from '../../../components/GateActionBar';
import type { AppRouter } from '../../../../studio/src/api/router';

type NotificationRow = inferRouterOutputs<AppRouter>['notifications']['list'][number];
type Gate2Input = inferRouterInputs<AppRouter>['runs']['gate2'];

// The in-app inbox. A pending approval_request reuses the same GateActionBar
// as Run detail, wired to the same runs.gate1/gate2 mutations — resolving
// from here or from Run detail is the same underlying call.
export default function NotificationsScreen() {
  const trpc = useTRPC();
  const { data, isLoading, isFetching, refetch } = useQuery(trpc.notifications.list.queryOptions());

  return (
    <Screen variant="tabRoot" title="Inbox">
      <FlatList
        contentContainerStyle={styles.container}
        data={data ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => refetch()} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No notifications yet.</Text> : null}
        renderItem={({ item }) => <NotificationCard notification={item} />}
      />
    </Screen>
  );
}

// Bugs Closure R4 — each gate raises its own inbox entry; which one is read off the
// message the gate itself wrote ("Gate 1 — <channel>" / "Gate 2 — <channel>"), so no
// payload change is needed.
function gateOf(message: string): 1 | 2 | null {
  const m = /^\s*Gate ([12])(?!\d)/.exec(message);
  return m ? (Number(m[1]) as 1 | 2) : null;
}

const GATE_NAME = { 1: 'Script approval', 2: 'Video approval' } as const;
const DECISION_LABEL: Record<string, string> = {
  approve: 'Approved',
  edit: 'Script edited',
  revise: 'Revision requested',
  reject: 'Rejected',
};

// The one stage-specific line: for gate 1 the script's first line and review score; for
// gate 2 the Video Intelligence review result.
function gateSummary(message: string, gate: 1 | 2 | null): string | null {
  if (gate === 1) {
    const lines = message.split(/\r?\n/);
    const at = lines.findIndex((l) => l.startsWith('Script:'));
    const first = at >= 0 ? lines.slice(at + 1).find((l) => l.trim().length > 0) : undefined;
    const score = /^Review score: (.+)$/m.exec(message)?.[1];
    return [first ? `"${first.trim()}"` : null, score ? `Review score ${score}` : null].filter(Boolean).join(' · ') || null;
  }
  if (gate === 2) {
    const verdict = /^Video Intelligence verdict: (.+)$/m.exec(message)?.[1];
    return verdict ? `Video review: ${verdict}` : null;
  }
  return null;
}

// A resolved gate shows what was decided, read from the run's own human review log for
// that gate (first one written after this notification was raised).
function useResolvedDecision(notification: NotificationRow, gate: 1 | 2 | null): string | null {
  const trpc = useTRPC();
  const enabled = Boolean(notification.resolvedAt && notification.threadKey && gate);
  const { data } = useQuery({
    ...trpc.runs.get.queryOptions({ id: notification.threadKey ?? '' }),
    enabled,
  });
  if (!enabled || !data) return null;
  const gateStageIds = new Set(data.stages.filter((st) => st.stageName === `gate${gate}`).map((st) => st.id));
  const log = data.reviewLogs
    .filter((l) => l.agent === 'human' && l.stageId && gateStageIds.has(l.stageId))
    .filter((l) => new Date(l.timestamp).getTime() >= new Date(notification.createdAt).getTime() - 1000)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
  return log ? (DECISION_LABEL[log.verdict] ?? null) : null;
}

// Bugs Closure 2 (P9) - the run's topic line, so two cards on the same channel can be
// told apart. Lazy per visible card; the run is cached by id and shared with the
// other lookups on this screen.
function useRunTopicLine(threadKey: string | null): string | null {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.runs.get.queryOptions({ id: threadKey ?? '' }),
    enabled: Boolean(threadKey),
  });
  return data ? runTopic(data.run) : null;
}

function NotificationCard({ notification }: { notification: NotificationRow }) {
  const topic = useRunTopicLine(notification.threadKey);
  const isPendingApproval = notification.kind === 'approval_request' && !notification.resolvedAt;
  const gate = notification.kind === 'approval_request' ? gateOf(notification.message) : null;
  const decision = useResolvedDecision(notification, gate);
  const summary = gateSummary(notification.message, gate);
  const chipLabel =
    notification.kind !== 'approval_request'
      ? 'Notice'
      : gate
        ? notification.resolvedAt
          ? `${GATE_NAME[gate]} · ${decision ?? 'Resolved'}`
          : GATE_NAME[gate]
        : 'Approval needed';

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <StatusChip
          kind={isPendingApproval ? 'waiting' : 'neutral'}
          label={chipLabel}
        />
        <Text style={styles.time}>{relativeTime(notification.createdAt)}</Text>
      </View>
      {topic ? (
        <Text style={styles.topic} numberOfLines={2}>
          {topic}
        </Text>
      ) : null}
      <Text style={styles.message} numberOfLines={3}>
        {/* U1: older reminders carry the brief's own 'Topic:' prefix - strip it. */}
        {summary ?? notification.message.replace(/"Topic:s*/i, '"')}
      </Text>
      {notification.resolvedAt ? (
        <Text style={styles.resolved}>Resolved {relativeTime(notification.resolvedAt)}</Text>
      ) : null}
      {notification.threadKey ? (
        <Pressable onPress={() => router.push(`/run/${notification.threadKey}`)} accessibilityRole="button">
          <Text style={styles.openRun}>Open run →</Text>
        </Pressable>
      ) : null}
      {isPendingApproval && notification.threadKey ? <PendingGateActions runId={notification.threadKey} /> : null}
    </Card>
  );
}

// The notification only says which run; fetch that run's real status to know
// which gate is open, rather than duplicating a second gate-detection rule.
function PendingGateActions({ runId }: { runId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: runDetail, isLoading } = useQuery(trpc.runs.get.queryOptions({ id: runId }));

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.notifications.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.runs.get.queryKey({ id: runId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() }),
    ]);

  const gate1Mutation = useMutation(trpc.runs.gate1.mutationOptions({ onSuccess: () => invalidate() }));
  const gate2Mutation = useMutation(trpc.runs.gate2.mutationOptions({ onSuccess: () => invalidate() }));

  if (isLoading) return <ActivityIndicator style={{ marginTop: space.sm }} />;
  if (!runDetail) return null;

  const { run, stages } = runDetail;

  if (run.status === 'paused_gate1') {
    const scriptStage = [...stages].reverse().find((s) => s.stageName === 'script_generation');
    const scriptText = (scriptStage?.output?.scriptText as string | undefined) ?? '';
    return (
      <View style={styles.actions}>
        <GateActionBar
          gate={1}
          isSubmitting={gate1Mutation.isPending}
          initialEditText={scriptText}
          onApprove={() => gate1Mutation.mutate({ runId, action: 'approve' })}
          onReject={(reason) => gate1Mutation.mutate({ runId, action: 'reject', reason })}
          onEditOrRevise={(text) => gate1Mutation.mutate({ runId, action: 'edit', editedScriptText: text })}
        />
        {gate1Mutation.error ? <Text style={styles.errorText}>{gate1Mutation.error.message}</Text> : null}
      </View>
    );
  }

  if (run.status === 'paused_gate2') {
    return (
      <View style={styles.actions}>
        <GateActionBar
          gate={2}
          isSubmitting={gate2Mutation.isPending}
          onApprove={(privacy) => {
            const payload: Gate2Input = {
              runId,
              action: 'approve',
              ...(flags.gate2Visibility && privacy ? { privacyStatus: privacy } : {}),
            };
            gate2Mutation.mutate(payload);
          }}
          onReject={(reason) => gate2Mutation.mutate({ runId, action: 'reject', reason })}
          onEditOrRevise={(notes) => gate2Mutation.mutate({ runId, action: 'revise', notes })}
        />
        {gate2Mutation.error ? <Text style={styles.errorText}>{gate2Mutation.error.message}</Text> : null}
      </View>
    );
  }

  return <Text style={styles.alreadyResolved}>This gate was already resolved elsewhere.</Text>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  empty: { padding: 24, textAlign: 'center', ...type.body, color: color.muted },
  card: { gap: space.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { ...type.meta, fontSize: 12 },
  topic: { ...type.bodyStrong, color: color.ink },
  message: { ...type.body, color: color.ink },
  resolved: { ...type.meta, color: color.okText },
  openRun: { fontFamily: font.bold, fontSize: 13, color: color.accentText },
  alreadyResolved: { ...type.meta, fontStyle: 'italic' },
  actions: { marginTop: space.xs, gap: space.sm },
  errorText: { ...type.meta, color: color.danger },
});

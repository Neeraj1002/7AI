import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../../lib/trpc';
import { GateActionBar } from '../../components/GateActionBar';
import type { AppRouter } from '../../../studio/src/api/router';

// Real, server-inferred shape — same convention Task 2's channel-context.tsx
// established for `channels.list`.
type NotificationRow = inferRouterOutputs<AppRouter>['notifications']['list'][number];

// Sprint 3 Task 3 (FE10) — the real in-app notification inbox, the default
// path Sprint 3 backend Task 3 (K2) makes for every gate that opens. A
// pending `approval_request` row reuses the exact same `GateActionBar`
// component Run Detail already uses, wired to the same `runs.gate1`/`gate2`
// mutations — resolving from here and resolving from Run Detail are the
// same underlying `resolvePendingApproval` call; whichever the user taps
// first is what actually resolves the gate.
export default function NotificationsScreen() {
  const trpc = useTRPC();
  const { data, isLoading, isFetching, refetch } = useQuery(trpc.notifications.list.queryOptions());

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={data ?? []}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => refetch()} />}
      ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No notifications yet.</Text> : null}
      renderItem={({ item }) => <NotificationCard notification={item} />}
    />
  );
}

function NotificationCard({ notification }: { notification: NotificationRow }) {
  const isPendingApproval = notification.kind === 'approval_request' && !notification.resolvedAt;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.kind}>{notification.kind === 'approval_request' ? 'Approval needed' : 'Notice'}</Text>
        <Text style={styles.time}>{new Date(notification.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{notification.message}</Text>
      {notification.resolvedAt ? (
        <Text style={styles.resolved}>Resolved {new Date(notification.resolvedAt).toLocaleString()}</Text>
      ) : null}
      {isPendingApproval && notification.threadKey ? (
        <PendingGateActions runId={notification.threadKey} />
      ) : null}
    </View>
  );
}

// The notification itself doesn't say which gate (1 or 2) is open — only
// which run (`threadKey`, the same run-id threading every gate mechanism in
// this project already uses). Fetches that run's real current status to
// decide, the same way Run Detail's own section-switching logic already
// does, rather than guessing or duplicating a second gate-detection rule.
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

  if (isLoading) return <ActivityIndicator style={{ marginTop: 8 }} />;
  if (!runDetail) return null;

  const { run } = runDetail;

  if (run.status === 'paused_gate1') {
    return (
      <View style={styles.actions}>
        <GateActionBar
          editFieldLabel="Edited script text (or notes for regeneration)"
          isSubmitting={gate1Mutation.isPending}
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
          editFieldLabel="Revision notes"
          isSubmitting={gate2Mutation.isPending}
          onApprove={() => gate2Mutation.mutate({ runId, action: 'approve' })}
          onReject={(reason) => gate2Mutation.mutate({ runId, action: 'reject', reason })}
          onEditOrRevise={(notes) => gate2Mutation.mutate({ runId, action: 'revise', notes })}
        />
        {gate2Mutation.error ? <Text style={styles.errorText}>{gate2Mutation.error.message}</Text> : null}
      </View>
    );
  }

  // Someone else (Run Detail, or another device) already resolved this gate
  // — the notification's own `resolvedAt` just hasn't been refetched yet.
  return <Text style={styles.alreadyResolved}>This gate was already resolved elsewhere.</Text>;
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  empty: { padding: 24, textAlign: 'center', color: '#888' },
  card: {
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#333' },
  time: { fontSize: 11, color: '#999' },
  message: { fontSize: 14, lineHeight: 20 },
  resolved: { fontSize: 12, color: '#1a7f37' },
  alreadyResolved: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  actions: { marginTop: 6, gap: 6 },
  errorText: { color: '#c00', fontSize: 12 },
});

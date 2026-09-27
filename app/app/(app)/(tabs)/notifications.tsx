import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../../../lib/trpc';
import { flags } from '../../../lib/feature-flags';
import { relativeTime } from '../../../lib/run-labels';
import { color, font, space, type } from '../../../lib/theme';
import { Screen } from '../../../components/Screen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { GateActionBar } from '../../../components/GateActionBar';
import type { AppRouter } from '../../../../studio/src/api/router';

type NotificationRow = inferRouterOutputs<AppRouter>['notifications']['list'][number];

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

function NotificationCard({ notification }: { notification: NotificationRow }) {
  const isPendingApproval = notification.kind === 'approval_request' && !notification.resolvedAt;

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <StatusChip
          kind={isPendingApproval ? 'waiting' : 'neutral'}
          label={notification.kind === 'approval_request' ? 'Approval needed' : 'Notice'}
        />
        <Text style={styles.time}>{relativeTime(notification.createdAt)}</Text>
      </View>
      <Text style={styles.message} numberOfLines={3}>
        {notification.message}
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
            const input = { runId, action: 'approve' as const };
            gate2Mutation.mutate(flags.gate2Visibility && privacy ? ({ ...input, privacyStatus: privacy } as typeof input) : input);
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
  message: { ...type.body, color: color.ink },
  resolved: { ...type.meta, color: color.okText },
  openRun: { fontFamily: font.bold, fontSize: 13, color: color.accentText },
  alreadyResolved: { ...type.meta, fontStyle: 'italic' },
  actions: { marginTop: space.xs, gap: space.sm },
  errorText: { ...type.meta, color: color.danger },
});

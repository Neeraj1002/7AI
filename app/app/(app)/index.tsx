import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';

const QUEUE_STATUSES = ['paused_gate1', 'paused_gate2', 'needs_attention'] as const;

const STATUS_LABEL: Record<string, string> = {
  paused_gate1: 'Gate 1',
  paused_gate2: 'Gate 2',
  needs_attention: 'Needs attention',
};

// Queue screen — MOBILE_APP_DESIGN.md Section 4: "the screen the founder
// actually opens most." Deliberately not channel-scoped (unlike every other
// screen) — the task spec calls this out explicitly: it lists runs needing a
// decision *across* channels, so nothing gets missed just because the
// channel switcher is pointed elsewhere.
export default function QueueScreen() {
  const trpc = useTRPC();
  const { data, isLoading, isFetching, refetch } = useQuery(
    trpc.runs.list.queryOptions({ statuses: [...QUEUE_STATUSES] }),
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.dashboardLink} onPress={() => router.push('/dashboard')}>
        <Text style={styles.dashboardLinkText}>View Dashboard →</Text>
      </Pressable>
      <FlatList
        data={data ?? []}
        keyExtractor={(run) => run.id}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => refetch()} />}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>Nothing needs a decision right now.</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/run/${item.id}`)}>
            <View style={styles.rowHeader}>
              <Text style={styles.badge}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              <Text style={styles.time}>{new Date(item.updatedAt).toLocaleString()}</Text>
            </View>
            <Text style={styles.brief} numberOfLines={2}>
              {item.briefText}
            </Text>
            {item.lastError ? (
              <Text style={styles.errorText} numberOfLines={1}>
                {item.lastError}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/new-brief')}>
        <Text style={styles.fabText}>+ New Brief</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dashboardLink: { padding: 12, alignItems: 'flex-end' },
  dashboardLinkText: { fontSize: 13, fontWeight: '600', color: '#3b6fd6' },
  empty: { padding: 24, textAlign: 'center', color: '#888' },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#333',
    backgroundColor: '#eee',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  time: { fontSize: 11, color: '#999' },
  brief: { fontSize: 15 },
  errorText: { fontSize: 12, color: '#c00', marginTop: 4 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#111',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fabText: { color: '#fff', fontWeight: '700' },
});

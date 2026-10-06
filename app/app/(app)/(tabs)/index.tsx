import React, { useMemo } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useTRPC } from '../../../lib/trpc';
import { useChannels } from '../../../lib/channel-context';
import { Screen } from '../../../components/Screen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { SecondaryButton } from '../../../components/Buttons';
import { humanizeRunError, queueChip, relativeTime, statusLabel, stepperIndexForStage, STEPPER_STEPS } from '../../../lib/run-labels';
import { channelColors, color, font, radius, space, type } from '../../../lib/theme';

// Task 4/E1 — 'running'/'pending' added so an in-progress run is visible
// somewhere in the Queue (it used to appear nowhere between creation and
// reaching Gate 1).
const QUEUE_STATUSES = ['paused_gate1', 'paused_gate2', 'needs_attention', 'running', 'pending'] as const;
const FAB_HEIGHT = 52;

function waitingLabel(n: number): string {
  return `${n} ${n === 1 ? 'is' : 'are'} waiting on you`;
}
function attentionLabel(n: number): string {
  return `${n} need${n === 1 ? 's' : ''} attention`;
}
function stageLabelFor(stage: string | null): string {
  const idx = stepperIndexForStage(stage ?? undefined);
  return STEPPER_STEPS[idx] ?? statusLabel('running');
}

// Deliberately not channel-scoped: lists runs needing a decision across all
// channels so nothing is missed because a picker points elsewhere.
export default function QueueScreen() {
  const trpc = useTRPC();
  const { channelById, channelIndex } = useChannels();
  const { data, isLoading, isFetching, refetch } = useQuery(
    // Bugs Task 7 (R4) — a freshly started run only lands here once it reaches
    // Gate 1 (seconds to minutes later), and nothing refetched in the meantime.
    trpc.runs.list.queryOptions({ statuses: [...QUEUE_STATUSES] }, { refetchInterval: 15_000 }),
  );

  const { waiting, attention, inProgress } = useMemo(() => {
    const rows = data ?? [];
    return {
      waiting: rows.filter((r) => r.status === 'paused_gate1' || r.status === 'paused_gate2'),
      attention: rows.filter((r) => r.status === 'needs_attention'),
      inProgress: rows.filter((r) => r.status === 'running' || r.status === 'pending'),
    };
  }, [data]);

  const sections = [
    ...(waiting.length ? [{ key: 'waiting' as const, title: 'Waiting on you', data: waiting }] : []),
    ...(attention.length ? [{ key: 'attention' as const, title: 'Needs attention', data: attention }] : []),
    ...(inProgress.length ? [{ key: 'inProgress' as const, title: 'In progress', data: inProgress }] : []),
  ];

  return (
    <Screen
      variant="tabRoot"
      title="Queue"
      subtitle={`${waitingLabel(waiting.length)} · ${attentionLabel(attention.length)}${inProgress.length ? ` · ${inProgress.length} in progress` : ''}`}
    >
      <SectionList
        sections={sections}
        keyExtractor={(run) => run.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => refetch()} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nothing needs you right now.</Text>
              <SecondaryButton label="New brief" icon="plus" onPress={() => router.push('/new-brief')} />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View
              style={[
                styles.count,
                section.key === 'waiting'
                  ? styles.countWaiting
                  : section.key === 'attention'
                    ? styles.countAttention
                    : styles.countNeutral,
              ]}
            >
              <Text
                style={[
                  styles.countText,
                  {
                    color:
                      section.key === 'waiting'
                        ? color.onAccent
                        : section.key === 'attention'
                          ? color.warnText
                          : color.ink,
                  },
                ]}
              >
                {section.data.length}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item, section }) => {
          const channel = channelById(item.channelId);
          const idx = channelIndex(item.channelId);
          const dot = idx >= 0 ? channelColors[idx % channelColors.length][1] : color.future;

          if (section.key === 'inProgress') {
            const stepIndex = stepperIndexForStage(item.currentStage ?? undefined);
            return (
              <Pressable onPress={() => router.push(`/run/${item.id}`)} style={[styles.rowWrap, styles.progressRow]}>
                <View style={styles.topLine}>
                  <Text style={styles.progressBrief} numberOfLines={1}>
                    {item.briefText}
                  </Text>
                  {item.cancelRequested ? (
                    <StatusChip kind="neutral" label="Cancelling…" />
                  ) : (
                    <Text style={styles.time}>{relativeTime(item.updatedAt)}</Text>
                  )}
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${(stepIndex / 7) * 100}%` }]} />
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {stageLabelFor(item.currentStage)} · {channel?.name ?? 'Deleted channel'}
                </Text>
              </Pressable>
            );
          }

          const isWaiting = section.key === 'waiting';
          return (
            <Pressable onPress={() => router.push(`/run/${item.id}`)} style={styles.rowWrap}>
              <Card>
                <View style={styles.topLine}>
                  {isWaiting ? (
                    <StatusChip kind="waiting" label={queueChip(item.status)} />
                  ) : (
                    <View style={styles.attention}>
                      <Feather name="alert-triangle" size={14} color={color.warnText} />
                      <Text style={styles.attentionText} numberOfLines={1}>
                        {humanizeRunError(item.lastError) || 'Needs attention'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.time}>{relativeTime(item.updatedAt)}</Text>
                </View>
                <Text style={styles.brief} numberOfLines={2}>
                  {item.briefText}
                </Text>
                <View style={styles.metaLine}>
                  <View style={[styles.dot, { backgroundColor: dot }]} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {channel?.name ?? 'Deleted channel'}
                    {isWaiting ? '' : ' · tap to retry or cancel'}
                  </Text>
                  <Feather name="chevron-right" size={18} color={color.muted} style={styles.chevron} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/new-brief')} accessibilityRole="button">
        <Feather name="plus" size={20} color={color.onAccent} />
        <Text style={styles.fabText}>New brief</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: FAB_HEIGHT + 32, flexGrow: 1 },
  empty: { alignItems: 'center', gap: space.lg, paddingVertical: 48 },
  emptyText: { ...type.body, color: color.muted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  sectionTitle: { ...type.sectionTitle, color: color.ink },
  count: { minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countWaiting: { backgroundColor: color.accent },
  countAttention: { backgroundColor: color.warnBg },
  countNeutral: { backgroundColor: color.surface2 },
  countText: { fontFamily: font.bold, fontSize: 12 },
  rowWrap: { marginBottom: space.md },
  progressRow: {
    backgroundColor: color.surface2,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
  },
  progressBrief: { fontFamily: font.bold, fontSize: 14, color: color.ink, flexShrink: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: color.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: color.accent },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  attention: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  attentionText: { fontFamily: font.bold, fontSize: 13, color: color.warnText, flexShrink: 1 },
  time: { ...type.meta, fontSize: 12 },
  brief: { ...type.bodyStrong, color: color.ink },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { ...type.meta, flexShrink: 1 },
  chevron: { marginLeft: 'auto' },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    height: FAB_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  fabText: { ...type.button, color: color.onAccent },
});

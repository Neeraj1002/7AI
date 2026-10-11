import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useTRPC } from '../../../lib/trpc';
import { useChannels } from '../../../lib/channel-context';
import { FormScreen } from '../../../components/FormScreen';
import { Card } from '../../../components/Card';
import { StatusChip } from '../../../components/StatusChip';
import { SecondaryButton } from '../../../components/Buttons';
import { endedChip, humanizeRunError, queueChip, relativeTime, runTopic, startedLabel, statusLabel, stepperIndexForStage, STEPPER_STEPS } from '../../../lib/run-labels';
import { ENDED_STATUSES, QUEUE_POLL_MS, QUEUE_STATUSES } from '../../../lib/run-queries';
import { filterRuns, matchesStatusFilter, STATUS_FILTERS, type StatusFilter } from '../../../lib/queue-filter';
import { channelDotColor, color, font, radius, space, type } from '../../../lib/theme';

const FAB_HEIGHT = 52;
const ENDED_PAGE_SIZE = 20;
// "Recent runs" shows the latest few; "See all runs" opens the full Ended runs list.
const RECENT_COUNT = 4;

// U14: short wording so three counts fit on the one subtitle line.
function waitingLabel(n: number): string {
  return `${n} waiting`;
}
function attentionLabel(n: number): string {
  return `${n} need${n === 1 ? 's' : ''} attention`;
}
function stageLabelFor(stage: string | null): string {
  const idx = stepperIndexForStage(stage ?? undefined);
  return STEPPER_STEPS[idx] ?? statusLabel('running');
}

// Deliberately not channel-scoped by default: lists runs needing a decision across all
// channels so nothing is missed because a picker points elsewhere. The channel filter and the
// search only narrow the runs already loaded; neither calls the backend.
export default function QueueScreen() {
  const trpc = useTRPC();
  const { channels, channelById, channelIndex } = useChannels();
  const channelDot = (channelId: string) => {
    const idx = channelIndex(channelId);
    return idx >= 0 ? channelDotColor(idx) : color.future;
  };
  const { data, isLoading, isFetching, refetch } = useQuery(
    // Bugs Task 7 (R4) — a freshly started run only lands here once it reaches
    // Gate 1 (seconds to minutes later), and nothing refetched in the meantime.
    // Same input as the Inbox, so both screens share one cache entry.
    trpc.runs.list.queryOptions({ statuses: [...QUEUE_STATUSES] }, { refetchInterval: QUEUE_POLL_MS }),
  );
  // Ended runs feed "Recent runs" and the full Ended runs list (shared with the Inbox).
  const ended = useQuery(trpc.runs.list.queryOptions({ statuses: [...ENDED_STATUSES] }));

  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [showAll, setShowAll] = useState(false);
  const [endedShown, setEndedShown] = useState(ENDED_PAGE_SIZE);

  const endedRows = useMemo(
    () => [...(ended.data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [ended.data],
  );

  // Unfiltered counts drive the subtitle and the "nothing waiting" line; filtered rows drive the lists.
  const all = useMemo(() => {
    const rows = data ?? [];
    return {
      waiting: rows.filter((r) => r.status === 'paused_gate1' || r.status === 'paused_gate2'),
      attention: rows.filter((r) => r.status === 'needs_attention'),
      inProgress: rows.filter((r) => r.status === 'running' || r.status === 'pending'),
    };
  }, [data]);
  const nothingToDo = all.waiting.length + all.attention.length + all.inProgress.length === 0;

  const waiting = filterRuns(all.waiting, search, channelFilter);
  const attention = filterRuns(all.attention, search, channelFilter);
  const inProgress = filterRuns(all.inProgress, search, channelFilter);
  const endedMatching = filterRuns(endedRows, search, channelFilter);
  const endedByStatus = endedMatching.filter((r) => matchesStatusFilter(r, statusFilter));
  const searching = search.trim().length > 0;
  const noMatches =
    searching && waiting.length + attention.length + inProgress.length === 0 && endedMatching.length === 0 && !isLoading && !ended.isLoading;

  const sections = [
    ...(waiting.length ? [{ key: 'waiting' as const, title: 'Waiting on you', data: waiting }] : []),
    ...(attention.length ? [{ key: 'attention' as const, title: 'Needs attention', data: attention }] : []),
    ...(inProgress.length ? [{ key: 'inProgress' as const, title: 'In progress', data: inProgress }] : []),
  ];

  const recentRows = showAll ? endedByStatus.slice(0, endedShown) : endedByStatus.slice(0, RECENT_COUNT);

  const refreshAll = () => Promise.all([refetch(), ended.refetch()]);

  return (
    <FormScreen
      variant="tabRoot"
      title="Queue"
      subtitle={
        nothingToDo
          ? 'Nothing needs you right now'
          : `${waitingLabel(all.waiting.length)} · ${attentionLabel(all.attention.length)}${all.inProgress.length ? ` · ${all.inProgress.length} running` : ''}`
      }
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={(isFetching || ended.isFetching) && !isLoading} onRefresh={() => void refreshAll()} />}
      footer={
        searchFocused ? null : (
          <Pressable style={styles.fab} onPress={() => router.push('/new-brief')} accessibilityRole="button">
            <Feather name="plus" size={20} color={color.onAccent} />
            <Text style={styles.fabText}>New brief</Text>
          </Pressable>
        )
      }
    >
      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={color.muted} />
        <TextInput
          selectionColor={color.accent}
          cursorColor={color.accent}
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search runs by topic"
          placeholderTextColor={color.muted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search runs by topic"
        />
        {searching ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clearX}>
            <Feather name="x" size={18} color={color.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll} keyboardShouldPersistTaps="handled">
        <FilterChip label="All channels" active={channelFilter === null} onPress={() => setChannelFilter(null)} />
        {channels.map((c) => (
          <FilterChip key={c.id} label={c.name} active={channelFilter === c.id} onPress={() => setChannelFilter(c.id)} />
        ))}
      </ScrollView>

      {nothingToDo && !isLoading && !searching ? (
        <View style={styles.allClear}>
          <Text style={styles.allClearText}>✓ Nothing waiting on you · nothing in progress</Text>
        </View>
      ) : null}

      {noMatches ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No runs match “{search.trim()}”.</Text>
          <SecondaryButton label="Clear search" onPress={() => setSearch('')} />
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.key}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={[styles.count, section.key === 'waiting' ? styles.countWaiting : section.key === 'attention' ? styles.countAttention : styles.countNeutral]}>
              <Text
                style={[
                  styles.countText,
                  { color: section.key === 'waiting' ? color.onAccent : section.key === 'attention' ? color.warnText : color.ink },
                ]}
              >
                {section.data.length}
              </Text>
            </View>
          </View>
          {section.data.map((item) => {
            const channel = channelById(item.channelId);
            if (section.key === 'inProgress') {
              const stepIndex = stepperIndexForStage(item.currentStage ?? undefined);
              return (
                <Pressable key={item.id} onPress={() => router.push(`/run/${item.id}`)} style={[styles.rowWrap, styles.progressRow]}>
                  <View style={styles.topLine}>
                    <Text style={styles.progressBrief} numberOfLines={1}>
                      {runTopic(item)}
                    </Text>
                    {item.cancelRequested ? <StatusChip kind="neutral" label="Cancelling…" /> : <Text style={styles.time}>{relativeTime(item.updatedAt)}</Text>}
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${(stepIndex / 7) * 100}%` }]} />
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {stageLabelFor(item.currentStage)} · {channel?.name ?? 'Deleted channel'} · {startedLabel(item.createdAt)}
                  </Text>
                </Pressable>
              );
            }
            const isWaiting = section.key === 'waiting';
            return (
              <Pressable key={item.id} onPress={() => router.push(`/run/${item.id}`)} style={styles.rowWrap}>
                <Card>
                  <View style={styles.topLine}>
                    {isWaiting ? (
                      <StatusChip kind="waiting" label={queueChip(item.status)} />
                    ) : (
                      <View style={styles.attention}>
                        <Feather name="alert-triangle" size={14} color={color.warnText} />
                        <Text style={styles.attentionText} numberOfLines={2}>
                          {humanizeRunError(item.lastError) || 'Needs attention'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.time}>{relativeTime(item.updatedAt)}</Text>
                  </View>
                  <Text style={styles.brief} numberOfLines={2}>
                    {runTopic(item)}
                  </Text>
                  <View style={styles.metaLine}>
                    <View style={[styles.dot, { backgroundColor: channelDot(item.channelId) }]} />
                    <Text style={styles.meta} numberOfLines={1}>
                      {channel?.name ?? 'Deleted channel'} · {startedLabel(item.createdAt)}
                      {isWaiting ? '' : ' · tap to retry or cancel'}
                    </Text>
                    <Feather name="chevron-right" size={18} color={color.muted} style={styles.chevron} />
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      ))}

      {!noMatches ? (
        <View style={styles.recent}>
          <Text style={styles.sectionTitle}>Recent runs</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll} keyboardShouldPersistTaps="handled">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} label={s} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
            ))}
          </ScrollView>
          {ended.isLoading ? (
            <Text style={styles.meta}>Loading…</Text>
          ) : recentRows.length === 0 ? (
            <Text style={styles.meta}>{endedRows.length === 0 ? 'No ended runs yet.' : 'No runs to show here.'}</Text>
          ) : (
            <View>
              {recentRows.map((run) => {
                const chip = endedChip(run);
                return (
                  <Pressable key={run.id} onPress={() => router.push(`/run/${run.id}`)} style={styles.recentRow} accessibilityRole="button">
                    <View style={styles.recentText}>
                      <Text style={styles.recentTitle} numberOfLines={2}>
                        {runTopic(run)}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {channelById(run.channelId)?.name ?? 'Deleted channel'} · {relativeTime(run.createdAt)}
                      </Text>
                    </View>
                    <StatusChip kind={chip.kind} label={chip.label} />
                    <Feather name="chevron-right" size={18} color={color.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}
          {showAll && endedByStatus.length > endedShown ? (
            <SecondaryButton label="Show more" onPress={() => setEndedShown((n) => n + ENDED_PAGE_SIZE)} />
          ) : null}
          {endedByStatus.length > RECENT_COUNT ? (
            <Pressable
              onPress={() => {
                setShowAll((v) => !v);
                setEndedShown(ENDED_PAGE_SIZE);
              }}
              style={styles.seeAll}
              accessibilityRole="button"
              accessibilityLabel="Ended runs"
            >
              <Text style={styles.seeAllText}>{showAll ? 'Show fewer' : 'See all runs →'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </FormScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // U2: the button's height plus its bottom margin plus breathing room, so the last card is never covered.
  list: { paddingHorizontal: space.lg, paddingBottom: FAB_HEIGHT + space.lg + 48, gap: 10 },
  searchBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.surface2,
  },
  searchInput: { flex: 1, minHeight: 44, fontFamily: font.regular, fontSize: 15, color: color.ink, padding: 0 },
  clearX: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  chipScroll: { gap: 8, paddingVertical: 6 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: color.future },
  chipActive: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  chipTextActive: { fontFamily: font.black, color: color.onAccent },
  allClear: { padding: 14, borderRadius: radius.lg, backgroundColor: color.okBg },
  allClearText: { fontFamily: font.bold, fontSize: 14, color: color.okText },
  empty: { alignItems: 'center', gap: space.lg, paddingVertical: 32 },
  emptyText: { ...type.body, color: color.muted, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm, paddingBottom: space.sm },
  sectionTitle: { fontFamily: font.black, fontSize: 16, color: color.ink },
  count: { minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countWaiting: { backgroundColor: color.accent },
  countAttention: { backgroundColor: color.warnBg },
  countNeutral: { backgroundColor: color.surface2 },
  countText: { fontFamily: font.bold, fontSize: 12 },
  rowWrap: { marginBottom: space.md },
  progressRow: { backgroundColor: color.surface2, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
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
  recent: { gap: 4, paddingTop: space.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 12, borderTopWidth: 1, borderTopColor: color.border },
  recentText: { flex: 1, gap: 4 },
  recentTitle: { fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.ink },
  seeAll: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  seeAllText: { fontFamily: font.black, fontSize: 13, color: color.accent },
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

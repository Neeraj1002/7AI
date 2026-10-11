import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart } from 'react-native-gifted-charts';
import { Feather } from '@expo/vector-icons';
import { useTRPC } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useChannels } from '../../../lib/channel-context';
import { channelDotColor, color, font, radius, space, type } from '../../../lib/theme';
import { Screen } from '../../../components/Screen';
import { Card } from '../../../components/Card';
import { SecondaryButton } from '../../../components/Buttons';
import { ChannelPickerSheet } from '../../../components/ChannelPickerSheet';


function money(x: number): string {
  return `$${x > 0 && x < 0.01 ? x.toFixed(4) : x.toFixed(2)}`;
}

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

const SCORE_BUCKETS = ['≤5', '6', '7', '8', '9', '10'] as const;
const BAR_MAX_HEIGHT = 104;

function LegendItem({ color: swatch, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <Text style={styles.sub}>{label}</Text>
    </View>
  );
}

function bucketScores(rows: { score: number; count: number }[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    const idx = row.score <= 5 ? 0 : Math.min(row.score - 5, 5);
    buckets[idx] += row.count;
  }
  return buckets;
}

function formatDecisionTime(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export default function DashboardScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { apiUrl } = useAuth();
  const { channels, channelIndex, channelById } = useChannels();
  const [filterId, setFilterId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const input = { channelId: filterId ?? undefined };
  const quality = useQuery(trpc.dashboard.quality.queryOptions(input));
  const operational = useQuery(trpc.dashboard.operational.queryOptions(input));
  const cost = useQuery(trpc.dashboard.cost.queryOptions(input));
  const content = useQuery(trpc.dashboard.content.queryOptions(input));
  // Bugs Closure R3 — deliberately not in `all` below: an older server without this route must not blank the screen.
  const gates = useQuery(trpc.dashboard.gates.queryOptions(input));
  const all = [quality, operational, cost, content];
  // U7: measured card width so the performance chart fits inside its card instead of running past the edge.
  const [chartWidth, setChartWidth] = useState(0);

  const isRefreshing = all.some((q) => q.isFetching && !q.isLoading);
  const isInitialLoading = all.some((q) => q.isLoading);
  const allFailed = all.every((q) => q.isError);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });

  const selected = channelById(filterId);
  const idx = channelIndex(filterId);
  const pill = (
    <Pressable style={styles.pill} onPress={() => setPickerOpen(true)} accessibilityRole="button">
      <View
        style={[
          styles.pillDot,
          { backgroundColor: idx >= 0 ? channelDotColor(idx) : color.ink },
        ]}
      />
      <Text style={styles.pillText} numberOfLines={1}>
        {selected?.name ?? 'All channels'}
      </Text>
      <Feather name="chevron-down" size={16} color={color.muted} />
    </Pressable>
  );

  // stageFunnel buckets every run (terminal or not) by its current stage, so
  // summing every bucket is the real total run count — filtering for a single
  // stage like 'intake' undercounts almost to zero (R7's same fix on Channel detail).
  const totalRuns = operational.data?.stageFunnel.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const noRunsOnChannel = filterId !== null && operational.data && totalRuns === 0;

  let body: React.ReactNode;
  if (isInitialLoading) {
    body = <ActivityIndicator style={styles.loading} />;
  } else if (allFailed) {
    body = (
      <Card>
        <Text style={styles.cardTitle}>Can&apos;t reach the server at {apiUrl ?? 'the API'}</Text>
        <SecondaryButton label="Retry" icon="rotate-cw" onPress={refresh} />
      </Card>
    );
  } else if (noRunsOnChannel) {
    body = (
      <Card>
        <Text style={styles.cardTitle}>No runs on this channel yet</Text>
        <SecondaryButton label="New brief" icon="plus" onPress={() => router.push('/new-brief')} />
      </Card>
    );
  } else {
    const succ = operational.data?.successRate;
    // Bugs Task 12 (R3): published / (published + failed + rejected); cancelled runs are not counted. An older
    // server (no `published` field) falls back to the old completed/failed/needs-attention wording.
    const split = succ as
      | (typeof succ & { published?: number; rejected?: number; cancelled?: number })
      | undefined;
    const hasSplit = split?.published !== undefined;
    const succTotal = split
      ? hasSplit
        ? (split.published ?? 0) + split.failed + (split.rejected ?? 0)
        : split.completed + split.failed + (split.needsAttention ?? 0)
      : 0;
    const regen = quality.data?.videoRegenRate;
    // Bugs Closure R1 (D1) — the limit is weekly; compare this week's spend, and for a
    // single channel its own effective ceiling. Falls back to the old fields against an
    // older server that doesn't send them yet.
    const spend = cost.data?.weekSpendUsd ?? cost.data?.totalSpendUsd ?? 0;
    const channelCost = filterId ? cost.data?.byChannel.find((c) => c.channelId === filterId) : undefined;
    const ceiling = channelCost?.effectiveCeilingUsd ?? cost.data?.budgetCeilingUsd ?? null;
    const perVideo = cost.data?.costPerPublishedVideo.costPerVideoUsd ?? null;
    const g1 = quality.data?.gate1Rates;
    const g1Total = g1 ? g1.approve + g1.edit + g1.reject : 0;

    body = (
      <>
        <View style={styles.grid}>
          <Card style={styles.half}>
            <Text style={styles.statLabel}>Success rate</Text>
            <Text style={styles.stat}>{succTotal > 0 ? pct(succ!.rate) : '—'}</Text>
            <Text style={styles.sub}>
              {succTotal > 0
                ? hasSplit
                  ? `${split!.published} published · ${split!.failed} failed · ${split!.rejected ?? 0} rejected`
                  : `${succ!.completed} finished${succ!.needsAttention ? ` · ${succ!.needsAttention} needs attention` : ''}${succ!.failed ? ` · ${succ!.failed} failed` : ''}`
                : totalRuns > 0
                  ? 'No finished runs yet'
                  : 'No runs yet'}
            </Text>
            {hasSplit && (split?.cancelled ?? 0) > 0 ? (
              <Text style={styles.subMuted}>{split!.cancelled} cancelled (not counted)</Text>
            ) : null}
          </Card>
          <Card style={styles.half}>
            <Text style={styles.statLabel}>Video regen rate</Text>
            <Text style={styles.stat}>{regen && regen.runsReachedVideoGen > 0 ? pct(regen.rate) : '—'}</Text>
            <Text style={styles.sub}>
              {regen && regen.runsReachedVideoGen > 0
                ? `${regen.runsWithRegen} of ${regen.runsReachedVideoGen} needed a redo`
                : totalRuns > 0
                  ? 'No finished runs yet'
                  : 'No runs yet'}
            </Text>
          </Card>
        </View>

        {cost.data ? (
          <Card>
            <Text style={styles.statLabel}>Spend this week</Text>
            <View style={styles.spendRow}>
              <Text style={styles.stat}>{money(spend)}</Text>
              {ceiling !== null ? <Text style={styles.sub}>of {money(ceiling)}</Text> : null}
            </View>
            {ceiling !== null && ceiling > 0 ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, (spend / ceiling) * 100)}%`, backgroundColor: color.accent }]} />
              </View>
            ) : null}
            {ceiling !== null ? <Text style={styles.sub}>Resets Monday</Text> : null}
            {perVideo !== null ? <Text style={styles.sub}>{money(perVideo)} per published video (all time, not this week)</Text> : null}
          </Card>
        ) : null}

        {gates.data ? (
          <Card>
            <Text style={styles.cardTitle}>Approval gates</Text>
            {([
              ['Gate 1 · Script', gates.data.gate1],
              ['Gate 2 · Video', gates.data.gate2],
            ] as const).map(([label, g]) => (
              <Text key={label} style={styles.sub}>
                {label}: {g.approved} approved · {g.revised} revised · {g.rejected} rejected
                {g.medianDecisionSeconds !== null ? ` · typically decided in ${formatDecisionTime(g.medianDecisionSeconds)}` : ''}
              </Text>
            ))}
          </Card>
        ) : null}

        {quality.data ? (
          <Card>
            <Text style={styles.cardTitle}>Script review scores</Text>
            {quality.data.scriptReviewScoreDistribution.length > 0 ? (
              (() => {
                const counts = bucketScores(quality.data.scriptReviewScoreDistribution);
                const maxCount = Math.max(...counts);
                const scale = maxCount * 24 > BAR_MAX_HEIGHT ? BAR_MAX_HEIGHT / (maxCount * 24) : 1;
                return (
                  <View style={styles.scoreRow}>
                    {SCORE_BUCKETS.map((label, i) => {
                      const count = counts[i];
                      const height = count === 0 ? 3 : Math.round(count * 24 * scale);
                      const passing = i >= 2; // buckets: ≤5, 6, 7, 8, 9, 10 — 7+ is index 2+
                      return (
                        <View key={label} style={styles.scoreCol}>
                          <Text style={styles.scoreCount}>{count}</Text>
                          <View
                            style={[
                              styles.scoreBar,
                              { height, backgroundColor: passing ? color.accent : color.chartLow },
                            ]}
                          />
                          <Text style={styles.scoreLabel}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()
            ) : (
              <Text style={styles.sub}>No Script Review scores yet.</Text>
            )}
          </Card>
        ) : null}

        {g1 ? (
          <Card>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Gate 1 decisions</Text>
              {g1Total > 0 ? <Text style={styles.sub}>{g1Total} total</Text> : null}
            </View>
            {g1Total > 0 ? (
              <>
                <View style={styles.stack}>
                  <View style={{ flex: g1.approve, backgroundColor: color.accent }} />
                  <View style={styles.stackGap} />
                  <View style={{ flex: g1.edit, backgroundColor: color.chartEdit }} />
                  <View style={styles.stackGap} />
                  <View style={{ flex: g1.reject, backgroundColor: color.ink }} />
                </View>
                <View style={styles.legendRow}>
                  <LegendItem color={color.accent} label={`Approved ${g1.approve}`} />
                  <LegendItem color={color.chartEdit} label={`Revised ${g1.edit}`} />
                  <LegendItem color={color.ink} label={`Rejected ${g1.reject}`} />
                </View>
              </>
            ) : (
              <Text style={styles.sub}>No decisions yet.</Text>
            )}
          </Card>
        ) : null}

        {content.data?.available ? (
          <Card>
            <Text style={styles.cardTitle}>Content performance</Text>
            <Text style={styles.sub}>
              {content.data.totalVideosTracked} videos · {content.data.totals.views} views · {content.data.totals.likes}{' '}
              likes · {content.data.totals.comments} comments
            </Text>
            {content.data.trend.length > 1 ? (
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              <LineChart
                data={content.data.trend.map((row) => ({ value: row.views }))}
                height={140}
                width={Math.max(0, chartWidth - 48)}
                adjustToWidth
                initialSpacing={4}
                endSpacing={4}
                color={color.accent}
                thickness={2}
                yAxisTextStyle={styles.axis}
                hideDataPoints={content.data.trend.length > 20}
              />
              </View>
            ) : (
              <Text style={styles.sub}>Not enough snapshots yet for a trend.</Text>
            )}
          </Card>
        ) : content.data ? (
          <Card>
            <Text style={styles.cardTitle}>Content performance</Text>
            <Text style={styles.sub}>No data yet.</Text>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <Screen variant="tabRoot" title="Dashboard">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {channels.length > 0 ? (
          <View style={styles.topRow}>
            {pill}
            <Pressable onPress={() => router.push('/compare')} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.compareLink}>Compare channels ›</Text>
            </Pressable>
          </View>
        ) : null}
        {body}
      </ScrollView>
      <ChannelPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="filter"
        selectedId={filterId}
        onSelect={setFilterId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  loading: { marginTop: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  compareLink: { ...type.sectionTitle, fontSize: 14, color: color.accentText },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    maxWidth: '100%',
  },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontFamily: font.bold, fontSize: 14, color: color.ink, flexShrink: 1 },
  grid: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  statLabel: { ...type.meta },
  stat: { ...type.stat, color: color.ink },
  sub: { ...type.meta, fontSize: 12 },
  subMuted: { ...type.meta, fontSize: 12, opacity: 0.7 },
  spendRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: color.surface2 },
  stackGap: { width: 2, backgroundColor: color.bg },
  axis: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: space.sm },
  scoreCol: { alignItems: 'center', gap: 4, flex: 1 },
  scoreCount: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  scoreBar: { width: 28, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  scoreLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  legendRow: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
});

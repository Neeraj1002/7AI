import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Feather } from '@expo/vector-icons';
import { useTRPC } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useChannels } from '../../../lib/channel-context';
import { channelColors, color, font, radius, space, type } from '../../../lib/theme';
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
  const all = [quality, operational, cost, content];

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
          { backgroundColor: idx >= 0 ? channelColors[idx % channelColors.length][1] : color.ink },
        ]}
      />
      <Text style={styles.pillText} numberOfLines={1}>
        {selected?.name ?? 'All channels'}
      </Text>
      <Feather name="chevron-down" size={16} color={color.muted} />
    </Pressable>
  );

  const totalRuns = operational.data?.stageFunnel.find((r) => r.stage === 'intake')?.count ?? 0;
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
    const succTotal = succ ? succ.completed + succ.failed : 0;
    const regen = quality.data?.videoRegenRate;
    const spend = cost.data?.totalSpendUsd ?? 0;
    const ceiling = cost.data?.budgetCeilingUsd ?? null;
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
              {succTotal > 0 ? `${succ!.completed} of ${succTotal} runs finished` : 'No runs yet'}
            </Text>
          </Card>
          <Card style={styles.half}>
            <Text style={styles.statLabel}>Video regen rate</Text>
            <Text style={styles.stat}>{regen && regen.runsReachedVideoGen > 0 ? pct(regen.rate) : '—'}</Text>
            <Text style={styles.sub}>
              {regen && regen.runsReachedVideoGen > 0
                ? `${regen.runsWithRegen} of ${regen.runsReachedVideoGen} needed a redo`
                : 'No runs yet'}
            </Text>
          </Card>
        </View>

        {cost.data ? (
          <Card>
            <Text style={styles.statLabel}>Spend this period</Text>
            <View style={styles.spendRow}>
              <Text style={styles.stat}>{money(spend)}</Text>
              {ceiling !== null ? <Text style={styles.sub}>of {money(ceiling)}</Text> : null}
            </View>
            {ceiling !== null && ceiling > 0 ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, (spend / ceiling) * 100)}%`, backgroundColor: color.accent }]} />
              </View>
            ) : null}
            {perVideo !== null ? <Text style={styles.sub}>{money(perVideo)} per published video</Text> : null}
          </Card>
        ) : null}

        {quality.data ? (
          <Card>
            <Text style={styles.cardTitle}>Script review scores</Text>
            {quality.data.scriptReviewScoreDistribution.length > 0 ? (
              <BarChart
                data={quality.data.scriptReviewScoreDistribution.map((row) => ({
                  value: row.count,
                  label: String(row.score),
                  frontColor: row.score >= 7 ? color.accent : color.chartLow,
                }))}
                height={140}
                barWidth={20}
                spacing={14}
                noOfSections={4}
                yAxisTextStyle={styles.axis}
                xAxisLabelTextStyle={styles.axis}
              />
            ) : (
              <Text style={styles.sub}>No Script Review scores yet.</Text>
            )}
          </Card>
        ) : null}

        {g1 ? (
          <Card>
            <Text style={styles.cardTitle}>Gate 1 decisions</Text>
            {g1Total > 0 ? (
              <>
                <View style={styles.stack}>
                  <View style={{ flex: g1.approve, backgroundColor: color.accent }} />
                  <View style={{ flex: g1.edit, backgroundColor: color.chartEdit }} />
                  <View style={{ flex: g1.reject, backgroundColor: color.ink }} />
                </View>
                <Text style={styles.sub}>
                  Approved {g1.approve} · Edited {g1.edit} · Rejected {g1.reject}
                </Text>
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
              <LineChart
                data={content.data.trend.map((row) => ({ value: row.views }))}
                height={140}
                color={color.accent}
                thickness={2}
                yAxisTextStyle={styles.axis}
                hideDataPoints={content.data.trend.length > 20}
              />
            ) : (
              <Text style={styles.sub}>Not enough snapshots yet for a trend.</Text>
            )}
          </Card>
        ) : content.data ? (
          <Card>
            <Text style={styles.cardTitle}>Content performance</Text>
            <Text style={styles.sub}>Nothing yet — this fills in once videos are published and polled.</Text>
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
        {channels.length > 0 ? pill : null}
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
  spendRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: color.surface2 },
  axis: { fontFamily: font.regular, fontSize: 11, color: color.muted },
});

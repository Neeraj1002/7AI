import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { useTRPC } from '../../lib/trpc';
import { useChannels } from '../../lib/channel-context';

// Dashboard — BUSINESS_LOGIC.md Section 3 / MOBILE_APP_DESIGN.md Section 4's
// four groups. Sections are ordered per task3.md's own guidance: quality
// signal and operational health first (both have real data from Weeks 1–3
// already), cost second, content performance last (most likely to still be
// thin). Channel-scoped via the same ChannelProvider every other screen
// uses (Task 1's four endpoints gained an optional `channelId` input
// specifically for this).
export default function DashboardScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { selectedChannelId } = useChannels();

  const input = { channelId: selectedChannelId ?? undefined };
  const quality = useQuery(trpc.dashboard.quality.queryOptions(input));
  const operational = useQuery(trpc.dashboard.operational.queryOptions(input));
  const cost = useQuery(trpc.dashboard.cost.queryOptions(input));
  const content = useQuery(trpc.dashboard.content.queryOptions(input));

  const isRefreshing = [quality, operational, cost, content].some((q) => q.isFetching && !q.isLoading);
  const isInitialLoading = [quality, operational, cost, content].some((q) => q.isLoading);

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
  };

  if (isInitialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Quality signal */}
      <Section title="Quality signal">
        {quality.data ? (
          <>
            {/* Video regen rate — deliberately the first, most visible number in
                this section: the direct proxy for whether Week 4 Task 1's
                review-loop fix is working, per task3.md's explicit instruction
                not to bury it. */}
            <BigStat
              label="Video regen rate"
              value={formatPct(quality.data.videoRegenRate.rate)}
              sub={`${quality.data.videoRegenRate.runsWithRegen} of ${quality.data.videoRegenRate.runsReachedVideoGen} runs needed a regen`}
            />
            <SubHeading>Script Review score distribution</SubHeading>
            {quality.data.scriptReviewScoreDistribution.length > 0 ? (
              <BarChart
                data={quality.data.scriptReviewScoreDistribution.map((row) => ({
                  value: row.count,
                  label: String(row.score),
                }))}
                height={140}
                barWidth={20}
                spacing={14}
                noOfSections={4}
                yAxisTextStyle={styles.chartAxisText}
                xAxisLabelTextStyle={styles.chartAxisText}
                frontColor="#3b6fd6"
              />
            ) : (
              <EmptyNote text="No Script Review scores yet." />
            )}
            <SubHeading>Gate rates</SubHeading>
            <StatRow label="Gate 1 — approve" value={quality.data.gate1Rates.approve} />
            <StatRow label="Gate 1 — edit" value={quality.data.gate1Rates.edit} />
            <StatRow label="Gate 1 — reject" value={quality.data.gate1Rates.reject} />
            <StatRow label="Gate 2 — approve" value={quality.data.gate2Rates.approve} />
            <StatRow label="Gate 2 — revise" value={quality.data.gate2Rates.revise} />
            <StatRow label="Gate 2 — reject" value={quality.data.gate2Rates.reject} />
          </>
        ) : (
          <ErrorNote error={quality.error} />
        )}
      </Section>

      {/* Operational health */}
      <Section title="Operational health">
        {operational.data ? (
          <>
            <StatRow
              label="Success rate"
              value={`${formatPct(operational.data.successRate.rate)} (${operational.data.successRate.completed} / ${operational.data.successRate.completed + operational.data.successRate.failed})`}
            />
            <SubHeading>Stage funnel</SubHeading>
            {operational.data.stageFunnel.length > 0 ? (
              <BarChart
                data={operational.data.stageFunnel.map((row) => ({ value: row.count, label: row.stage }))}
                height={140}
                barWidth={18}
                spacing={10}
                noOfSections={4}
                yAxisTextStyle={styles.chartAxisText}
                xAxisLabelTextStyle={styles.chartAxisTextSmall}
                frontColor="#1a7f37"
              />
            ) : (
              <EmptyNote text="No runs yet." />
            )}
            <SubHeading>Needs attention ({operational.data.needsAttention.length})</SubHeading>
            {operational.data.needsAttention.slice(0, 5).map((run) => (
              <Text key={run.id} style={styles.listRow} numberOfLines={1}>
                {run.briefText} — {run.lastError}
              </Text>
            ))}
            <SubHeading>Recent completions</SubHeading>
            {operational.data.recentCompletions.length > 0 ? (
              operational.data.recentCompletions.slice(0, 5).map((run) => (
                <Text key={run.id} style={styles.listRow} numberOfLines={1}>
                  {run.briefText}
                </Text>
              ))
            ) : (
              <EmptyNote text="No completed runs yet." />
            )}
          </>
        ) : (
          <ErrorNote error={operational.error} />
        )}
      </Section>

      {/* Cost */}
      <Section title="Cost">
        {cost.data ? (
          <>
            <BigStat
              label="Total spend"
              value={`$${cost.data.totalSpendUsd.toFixed(4)}`}
              sub={
                cost.data.budgetCeilingUsd !== null
                  ? `of $${cost.data.budgetCeilingUsd.toFixed(2)} budget ceiling`
                  : 'no budget ceiling set'
              }
            />
            <StatRow
              label="Cost per published video"
              value={
                cost.data.costPerPublishedVideo.costPerVideoUsd !== null
                  ? `$${cost.data.costPerPublishedVideo.costPerVideoUsd.toFixed(4)} (${cost.data.costPerPublishedVideo.publishedCount} published)`
                  : 'no published videos yet'
              }
            />
            <SubHeading>By channel</SubHeading>
            {cost.data.byChannel.map((row) => (
              <StatRow key={row.channelId} label={row.channelName} value={`$${row.spendUsd.toFixed(4)}`} />
            ))}
            <SubHeading>By stage</SubHeading>
            {cost.data.byStage.length > 0 ? (
              cost.data.byStage.map((row) => (
                <StatRow key={row.stage} label={row.stage} value={`$${row.spendUsd.toFixed(4)}`} />
              ))
            ) : (
              <EmptyNote text="No spend recorded yet." />
            )}
          </>
        ) : (
          <ErrorNote error={cost.error} />
        )}
      </Section>

      {/* Content performance — expected to be the thinnest group; an honest
          empty state instead of a chart full of zeros when nothing's
          published/polled yet. */}
      <Section title="Content performance">
        {content.data ? (
          content.data.available ? (
            <>
              <StatRow label="Videos tracked" value={content.data.totalVideosTracked} />
              <StatRow label="Total views" value={content.data.totals.views} />
              <StatRow label="Total likes" value={content.data.totals.likes} />
              <StatRow label="Total comments" value={content.data.totals.comments} />
              <SubHeading>Views trend</SubHeading>
              {content.data.trend.length > 1 ? (
                <LineChart
                  data={content.data.trend.map((row) => ({ value: row.views }))}
                  height={140}
                  color="#3b6fd6"
                  thickness={2}
                  yAxisTextStyle={styles.chartAxisText}
                  hideDataPoints={content.data.trend.length > 20}
                />
              ) : (
                <EmptyNote text="Not enough snapshots yet for a trend." />
              )}
              <SubHeading>Best performers</SubHeading>
              {content.data.bestPerformers.map((row) => (
                <StatRow key={row.youtubeVideoId} label={row.youtubeVideoId} value={`${row.views} views`} />
              ))}
              <SubHeading>Worst performers</SubHeading>
              {content.data.worstPerformers.map((row) => (
                <StatRow key={row.youtubeVideoId} label={row.youtubeVideoId} value={`${row.views} views`} />
              ))}
            </>
          ) : (
            <EmptyNote text="No content performance data yet — this fills in once videos are published and polled (Week 4 Task 3)." />
          )
        ) : (
          <ErrorNote error={content.error} />
        )}
      </Section>
    </ScrollView>
  );
}

function formatPct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subHeading}>{children}</Text>;
}

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.bigStat}>
      <Text style={styles.bigStatValue}>{value}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
      {sub ? <Text style={styles.bigStatSub}>{sub}</Text> : null}
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <Text style={styles.emptyNote}>{text}</Text>;
}

function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Failed to load.';
  return <Text style={styles.errorNote}>{message}</Text>;
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { backgroundColor: '#f7f7f7', borderRadius: 12, padding: 14, gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  subHeading: { fontSize: 12, fontWeight: '700', color: '#555', marginTop: 12, marginBottom: 6 },
  bigStat: { alignItems: 'flex-start', marginBottom: 4 },
  bigStatValue: { fontSize: 28, fontWeight: '800' },
  bigStatLabel: { fontSize: 12, color: '#555', marginTop: 2 },
  bigStatSub: { fontSize: 11, color: '#888' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statLabel: { fontSize: 13, color: '#333', flexShrink: 1, marginRight: 8 },
  statValue: { fontSize: 13, fontWeight: '700' },
  listRow: { fontSize: 12, color: '#444', paddingVertical: 3 },
  emptyNote: { fontSize: 12, color: '#999', fontStyle: 'italic', paddingVertical: 6 },
  errorNote: { fontSize: 12, color: '#c00' },
  chartAxisText: { fontSize: 9, color: '#888' },
  chartAxisTextSmall: { fontSize: 8, color: '#888' },
});

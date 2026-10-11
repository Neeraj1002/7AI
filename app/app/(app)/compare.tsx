import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
import { useChannels } from '../../lib/channel-context';
import { color, font, space, type } from '../../lib/theme';
import { compactNumber, formatLabel } from '../../lib/compare';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { ChannelAvatar } from '../../components/ChannelAvatar';
import { SecondaryButton } from '../../components/Buttons';

// Sprint 4 FE E2 — channels side by side, then each channel's formats. Real data from
// `dashboard.comparison`; channels without published videos are shown, never hidden.
export default function CompareScreen() {
  const trpc = useTRPC();
  const { channelIndex } = useChannels();
  const comparison = useQuery(trpc.dashboard.comparison.queryOptions());
  const formats = useQuery(trpc.channels.listFormats.queryOptions());
  const labels: Record<string, string> = Object.fromEntries((formats.data ?? []).map((f) => [f.key, f.label]));

  let body: React.ReactNode;
  if (comparison.isLoading) {
    body = <ActivityIndicator style={styles.loading} />;
  } else if (comparison.isError || !comparison.data) {
    body = (
      <Card>
        <Text style={styles.title}>Couldn&apos;t load the comparison</Text>
        <SecondaryButton label="Retry" icon="rotate-cw" onPress={() => void comparison.refetch()} />
      </Card>
    );
  } else if (comparison.data.channels.length === 0) {
    body = (
      <Card>
        <Text style={styles.title}>No channels yet</Text>
      </Card>
    );
  } else {
    body = (
      <>
        {comparison.data.channels.map((ch) => (
          <Card key={ch.channelId}>
            <View style={styles.head}>
              <ChannelAvatar index={channelIndex(ch.channelId)} size={40} />
              <Text style={styles.title} numberOfLines={1}>
                {ch.channelName}
              </Text>
            </View>
            {ch.videoCount === 0 ? (
              <Text style={styles.meta}>No published videos yet</Text>
            ) : (
              <View style={styles.stats}>
                <Stat label="views" value={compactNumber(ch.totals.views)} />
                <Stat label="avg / video" value={compactNumber(ch.avgViewsPerVideo)} />
                <Stat label="videos" value={String(ch.videoCount)} />
              </View>
            )}
            {ch.byFormat.length > 0 ? (
              <View style={styles.table}>
                <View style={styles.tr}>
                  <Text style={[styles.th, styles.colFormat]}>FORMAT</Text>
                  <Text style={[styles.th, styles.colVideos]}>VIDEOS</Text>
                  <Text style={[styles.th, styles.colAvg]}>AVG VIEWS</Text>
                </View>
                {ch.byFormat.map((row) => (
                  <View key={row.formatKey ?? 'freeform'} style={styles.tr}>
                    <Text style={[styles.td, styles.colFormat]} numberOfLines={2}>
                      {formatLabel(row.formatKey, labels)}
                    </Text>
                    <Text style={[styles.td, styles.colVideos, styles.tdMuted]}>{row.videoCount}</Text>
                    <Text style={[styles.td, styles.colAvg, styles.tdBold]}>{compactNumber(row.avgViewsPerVideo)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
        <Text style={styles.meta}>Revenue appears once a channel joins the YouTube Partner Program.</Text>
      </>
    );
  }

  return (
    <Screen variant="stack" title="Compare channels" subtitle="Views, likes, comments — not revenue">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={comparison.isFetching && !comparison.isLoading}
            onRefresh={() => void comparison.refetch()}
          />
        }
      >
        {body}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  loading: { marginTop: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { ...type.sectionTitle, color: color.ink, flexShrink: 1 },
  meta: { ...type.meta, fontSize: 11 },
  stats: { flexDirection: 'row', gap: space.lg },
  stat: { gap: 2 },
  statValue: { fontFamily: font.black, fontSize: 20, color: color.ink },
  table: { marginTop: space.xs },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: color.border },
  th: { ...type.meta, fontSize: 11, fontWeight: '700' },
  td: { fontFamily: font.regular, fontSize: 13, color: color.ink },
  tdMuted: { color: color.muted },
  tdBold: { fontFamily: font.bold },
  colFormat: { flex: 1 },
  colVideos: { width: 44, textAlign: 'right' },
  colAvg: { width: 70, textAlign: 'right' },
});

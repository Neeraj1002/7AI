import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { color, font, radius, space, type } from '../../../lib/theme';
import { Card } from '../../../components/Card';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { StatCard } from '../../../components/admin/StatCard';
import { Chip, type ChipTone } from '../../../components/admin/Chip';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { LoadingView } from '../../../components/admin/LoadingView';
import { EmptyView } from '../../../components/admin/EmptyView';
import { ErrorView } from '../../../components/admin/ErrorView';
import { fmtAgo, fmtDuration, fmtUsd } from '../../../components/admin/format';

const SEVERITY_TONE: Record<'high' | 'medium' | 'low', ChipTone> = { high: 'danger', medium: 'warn', low: 'neutral' };

export default function AdminOverview() {
  const trpc = useTRPC();
  const overview = useQuery(trpc.admin.overview.queryOptions());
  const system = useQuery(trpc.admin.system.info.queryOptions());

  const openItem = (item: { kind: string; tenantId: string | null }) => {
    if (item.kind === 'bug_untriaged') router.push('/admin/bugs');
    else if (item.kind === 'cost_gap') router.push({ pathname: '/admin/usage', params: { tab: 'gaps' } });
    else if (item.tenantId) router.push({ pathname: '/admin/tenant/[id]', params: { id: item.tenantId } });
  };

  return (
    <AdminScreen title="Admin" subtitle="Platform overview">
      {overview.isLoading ? <LoadingView /> : null}
      {overview.isError ? <ErrorView message="Couldn't load the overview." onRetry={() => overview.refetch()} /> : null}
      {overview.data ? (
        <>
          <View style={styles.row}>
            <StatCard label="Tenants" value={String(overview.data.totals.tenants)} sub={`${overview.data.totals.users} users`} />
            <StatCard
              label="Active channels"
              value={String(overview.data.totals.activeChannels)}
              sub={`${overview.data.totals.inactiveChannels} archived`}
            />
          </View>
          <View style={styles.row}>
            <StatCard label="Runs this week" value={String(overview.data.runsThisWeek.total)} />
            <StatCard
              label="Spend this week"
              value={fmtUsd(overview.data.spend.thisWeekUsd)}
              sub={`${fmtUsd(overview.data.spend.allTimeUsd)} all time`}
            />
          </View>

          <SectionHeader title="Open now" />
          <Card style={styles.openNow}>
            <OpenCount label="Gate 1 waiting" n={overview.data.openNow.pausedGate1} />
            <OpenCount label="Gate 2 waiting" n={overview.data.openNow.pausedGate2} />
            <OpenCount label="Needs attention" n={overview.data.openNow.needsAttention} />
            <OpenCount label="Running" n={overview.data.openNow.running} />
          </Card>

          <SectionHeader title="Decision queue" />
          {overview.data.decisionQueue.length === 0 ? <EmptyView message="Nothing needs a decision" /> : null}
          {overview.data.decisionQueue.map((item, i) => {
            const tappable = item.kind === 'bug_untriaged' || item.kind === 'cost_gap' || item.tenantId !== null;
            return (
              <Pressable
                key={`${item.kind}-${item.tenantId ?? 'x'}-${item.channelId ?? ''}-${item.runId ?? ''}-${i}`}
                disabled={!tappable}
                onPress={() => openItem(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.severity} priority: ${item.message}`}
              >
                <Card>
                  <View style={styles.itemTop}>
                    <Chip label={item.severity} tone={SEVERITY_TONE[item.severity]} />
                    {item.since ? <Text style={styles.meta}>since {fmtAgo(item.since)}</Text> : null}
                  </View>
                  <Text style={styles.message}>{item.message}</Text>
                  {item.tenantName ? <Text style={styles.meta}>{item.tenantName}</Text> : null}
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : null}

      <SectionHeader title="System" />
      {system.isLoading ? <LoadingView /> : null}
      {system.isError ? <ErrorView message="Couldn't load system info." onRetry={() => system.refetch()} /> : null}
      {system.data ? <SystemCard info={system.data} /> : null}

      <SectionHeader title="Go to" />
      <View style={styles.tiles}>
        <NavTile label="Tenants" icon="users" onPress={() => router.push('/admin/tenants')} />
        <NavTile label="Usage" icon="bar-chart-2" onPress={() => router.push('/admin/usage')} />
        <NavTile label="Bugs" icon="flag" onPress={() => router.push('/admin/bugs')} />
        <NavTile label="Audit log" icon="list" onPress={() => router.push('/admin/audit')} />
      </View>
    </AdminScreen>
  );
}

function OpenCount({ label, n }: { label: string; n: number }) {
  return (
    <View style={styles.openCell} accessible accessibilityLabel={`${label}: ${n}`}>
      <Text style={styles.openValue}>{n}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const FLAG_LABELS: [keyof SystemFlagsShape, string][] = [
  ['mediaStub', 'Media stub'],
  ['stockFootageStub', 'Stock footage stub'],
  ['aiVisualsStub', 'AI visuals stub'],
  ['r2Configured', 'R2 storage'],
  ['openaiConfigured', 'OpenAI'],
  ['youtubeOauthConfigured', 'YouTube OAuth'],
];
type SystemFlagsShape = {
  mediaStub: boolean;
  stockFootageStub: boolean;
  aiVisualsStub: boolean;
  r2Configured: boolean;
  openaiConfigured: boolean;
  youtubeOauthConfigured: boolean;
};

function SystemCard({
  info,
}: {
  info: { commit: string | null; nodeEnv: string; uptimeSeconds: number; flags: SystemFlagsShape };
}) {
  const stubOn = info.flags.mediaStub || info.flags.stockFootageStub || info.flags.aiVisualsStub;
  return (
    <Card>
      <View style={styles.sysRow}>
        <Text style={styles.meta}>Commit</Text>
        <Text style={styles.sysValue}>{info.commit ?? 'unknown'}</Text>
      </View>
      <View style={styles.sysRow}>
        <Text style={styles.meta}>Environment</Text>
        <Text style={styles.sysValue}>{info.nodeEnv}</Text>
      </View>
      <View style={styles.sysRow}>
        <Text style={styles.meta}>Uptime</Text>
        <Text style={styles.sysValue}>{fmtDuration(info.uptimeSeconds)}</Text>
      </View>
      <View style={styles.flags}>
        {FLAG_LABELS.map(([key, label]) => {
          const on = info.flags[key];
          const isStub = key.endsWith('Stub');
          // A stub that is ON is the amber case; a configured service that is ON is fine.
          const tone: ChipTone = isStub ? (on ? 'warn' : 'neutral') : on ? 'ok' : 'neutral';
          return <Chip key={key} label={`${label}: ${on ? 'on' : 'off'}`} tone={tone} />;
        })}
      </View>
      {stubOn ? <Text style={styles.stubNote}>Stub mode: no real media or provider calls</Text> : null}
    </Card>
  );
}

function NavTile({ label, icon, onPress }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon} size={20} color={color.ink} />
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  meta: { ...type.meta },
  openNow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  openCell: { minWidth: '40%', flexGrow: 1, gap: 2 },
  openValue: { ...type.stat, fontSize: 24, color: color.ink },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  message: { ...type.body, color: color.ink },
  sysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  sysValue: { fontFamily: font.semibold, fontSize: 14, color: color.ink, flexShrink: 1 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  stubNote: { ...type.meta, color: color.warnText },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    minHeight: 64,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
  },
  tileText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
});

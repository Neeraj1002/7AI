import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { color, font, radius, space, type } from '../../../lib/theme';
import { Card } from '../../../components/Card';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { Banner } from '../../../components/admin/Banner';
import { Chip } from '../../../components/admin/Chip';
import { LoadingView } from '../../../components/admin/LoadingView';
import { EmptyView } from '../../../components/admin/EmptyView';
import { ErrorView } from '../../../components/admin/ErrorView';
import { fmtAgo, fmtDate, fmtUsd, shortId } from '../../../components/admin/format';
import { statusLabel, statusTone } from '../../../components/admin/status';

type Tab = 'week' | 'agent' | 'run' | 'gaps';
const TABS: { key: Tab; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'agent', label: 'Agent' },
  { key: 'run', label: 'Run' },
  { key: 'gaps', label: 'Gaps' },
];

export default function AdminUsage() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.find((t) => t.key === params.tab)?.key ?? 'week';
  const [tab, setTab] = useState<Tab>(initial);
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const trpc = useTRPC();
  const tenants = useQuery(trpc.admin.tenants.list.queryOptions());

  return (
    <AdminScreen title="Usage">
      <View style={styles.chips} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
      {tab !== 'gaps' && tenants.data && tenants.data.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All tenants" selected={tenantId === undefined} onPress={() => setTenantId(undefined)} />
          {tenants.data.map((t) => (
            <Chip key={t.id} label={t.name} selected={tenantId === t.id} onPress={() => setTenantId(t.id)} />
          ))}
        </ScrollView>
      ) : null}
      {tab === 'week' ? <WeekTab tenantId={tenantId} /> : null}
      {tab === 'agent' ? <AgentTab tenantId={tenantId} /> : null}
      {tab === 'run' ? <RunTab tenantId={tenantId} /> : null}
      {tab === 'gaps' ? <GapsTab /> : null}
    </AdminScreen>
  );
}

function WeekTab({ tenantId }: { tenantId?: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.admin.usage.byWeek.queryOptions({ weeks: 8, tenantId }));
  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView message="Couldn't load weekly usage." onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) return <EmptyView message="No usage recorded" />;
  const max = Math.max(...q.data.map((w) => w.costUsd), 0.0001);
  return (
    <>
      {q.data.map((w) => (
        <Card key={w.weekStartUtc}>
          <View style={styles.row}>
            <Text style={styles.meta}>Week of {fmtDate(w.weekStartUtc).split(',')[0]}</Text>
            <Text style={styles.value}>{fmtUsd(w.costUsd)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${Math.max(2, (w.costUsd / max) * 100)}%` }]} />
          </View>
          <Text style={styles.meta}>{w.events} events</Text>
        </Card>
      ))}
    </>
  );
}

function AgentTab({ tenantId }: { tenantId?: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.admin.usage.byAgent.queryOptions({ sinceDays: 30, tenantId }));
  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView message="Couldn't load usage by agent." onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) return <EmptyView message="No usage recorded" />;
  const total = q.data.reduce((s, r) => s + r.costUsd, 0);
  return (
    <>
      <Text style={styles.meta}>Last 30 days · total {fmtUsd(total)}</Text>
      {q.data.map((r) => (
        <Card key={`${r.agent}|${r.provider}|${r.model}`}>
          <View style={styles.row}>
            <Text style={styles.name}>{r.agent}</Text>
            <Text style={styles.value}>{fmtUsd(r.costUsd)}</Text>
          </View>
          <Text style={styles.meta}>
            {r.provider} / {r.model}
          </Text>
          <Text style={styles.meta}>
            {r.calls} calls · {total > 0 ? `${((r.costUsd / total) * 100).toFixed(1)}%` : '0%'} of spend
          </Text>
        </Card>
      ))}
    </>
  );
}

function RunTab({ tenantId }: { tenantId?: string }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.admin.usage.byRun.queryOptions({ limit: 20, tenantId }));
  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView message="Couldn't load usage by run." onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) return <EmptyView message="No runs with usage" />;
  return (
    <>
      {q.data.map((r) => (
        <Pressable
          key={r.pipelineRunId}
          onPress={() => router.push({ pathname: '/admin/run/[id]', params: { id: r.pipelineRunId } })}
          accessibilityRole="button"
          accessibilityLabel={`Run ${shortId(r.pipelineRunId)}, ${fmtUsd(r.costUsd)}`}
        >
          <Card>
            <View style={styles.row}>
              <Text style={styles.name}>{shortId(r.pipelineRunId)}</Text>
              <Text style={styles.value}>{fmtUsd(r.costUsd)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>{r.channelName ?? 'Unknown channel'}</Text>
              {r.status ? <Chip label={statusLabel(r.status)} tone={statusTone(r.status)} /> : null}
            </View>
            <Text style={styles.meta}>{r.events} events</Text>
          </Card>
        </Pressable>
      ))}
    </>
  );
}

function GapsTab() {
  const trpc = useTRPC();
  const q = useQuery(trpc.admin.usage.gaps.queryOptions({ sinceDays: 30 }));
  return (
    <>
      <Banner kind="info">These calls recorded $0. If they should have cost something, spend is under-counted.</Banner>
      {q.isLoading ? <LoadingView /> : null}
      {q.isError ? <ErrorView message="Couldn't load cost gaps." onRetry={() => q.refetch()} /> : null}
      {q.data && q.data.length === 0 ? <EmptyView message="No $0 usage in the last 30 days" /> : null}
      {q.data?.map((g) => (
        <Card key={`${g.agent}|${g.provider}|${g.model}`}>
          <View style={styles.row}>
            <Text style={styles.name}>{g.agent}</Text>
            <Chip label={`${g.events} events`} tone="warn" />
          </View>
          <Text style={styles.meta}>
            {g.provider} / {g.model}
          </Text>
          <Text style={styles.meta}>
            First {fmtAgo(g.firstAt)} · last {fmtAgo(g.lastAt)}
          </Text>
          {g.metadataKeys.length > 0 ? (
            <View style={styles.chips}>
              {g.metadataKeys.map((k) => (
                <Chip key={k} label={k} />
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  meta: { ...type.meta },
  name: { fontFamily: font.bold, fontSize: 15, color: color.ink, flexShrink: 1 },
  value: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  barTrack: { height: 10, borderRadius: radius.pill, backgroundColor: color.surface2, overflow: 'hidden' },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: color.accent },
});

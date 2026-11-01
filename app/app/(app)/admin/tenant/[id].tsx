import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../../lib/trpc';
import { isNotFoundError, type AdminOutputs } from '../../../../lib/use-admin';
import { color, font, space, type } from '../../../../lib/theme';
import { Card } from '../../../../components/Card';
import { ActionButton } from '../../../../components/admin/ActionButton';
import { AdminScreen } from '../../../../components/admin/AdminScreen';
import { Banner } from '../../../../components/admin/Banner';
import { Chip, type ChipTone } from '../../../../components/admin/Chip';
import { SectionHeader } from '../../../../components/admin/SectionHeader';
import { LoadingView } from '../../../../components/admin/LoadingView';
import { EmptyView } from '../../../../components/admin/EmptyView';
import { ErrorView } from '../../../../components/admin/ErrorView';
import { fmtAgo, fmtUsd, fmtWeekdayTime, humanize } from '../../../../components/admin/format';
import { statusLabel, statusTone } from '../../../../components/admin/status';

const CHANNEL_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  ok: { label: 'OK', tone: 'ok' },
  at_limit: { label: 'At limit', tone: 'danger' },
  zero_share: { label: 'Zero share', tone: 'danger' },
  inactive: { label: 'Inactive', tone: 'neutral' },
};

export default function AdminTenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  // Loaded in parallel; one failing never blanks the other.
  const tenant = useQuery({ ...trpc.admin.tenants.get.queryOptions({ tenantId: id }), retry: false });
  const budget = useQuery({ ...trpc.admin.budget.get.queryOptions({ tenantId: id }), retry: false });

  if (tenant.isError && isNotFoundError(tenant.error)) {
    return (
      <AdminScreen title="Tenant">
        <EmptyView message="Tenant not found" />
        <ActionButton label="Back" onPress={() => router.back()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title={tenant.data?.name ?? 'Tenant'} subtitle="Tenant detail">
      <SectionHeader title="Budget" />
      {budget.isLoading ? <LoadingView /> : null}
      {budget.isError ? <ErrorView message="Couldn't load the budget." onRetry={() => budget.refetch()} /> : null}
      {budget.data ? <BudgetPanel b={budget.data} /> : null}

      {tenant.isLoading ? <LoadingView /> : null}
      {tenant.isError ? <ErrorView message="Couldn't load this tenant." onRetry={() => tenant.refetch()} /> : null}
      {tenant.data ? (
        <>
          <SectionHeader title="Channels" />
          {tenant.data.channels.length === 0 ? <EmptyView message="No channels" /> : null}
          {tenant.data.channels.map((c) => {
            const old = c.credentialAgeDays !== null && c.credentialAgeDays >= 6;
            return (
              <Card key={c.id}>
                <View style={styles.top}>
                  <Text style={styles.name} numberOfLines={2}>
                    {c.name}
                  </Text>
                  <Chip label={c.isActive ? 'Active' : 'Archived'} tone={c.isActive ? 'ok' : 'neutral'} />
                </View>
                <Text style={styles.meta}>
                  Voice: {c.defaultVoice} · Privacy default: {c.defaultPrivacyStatus ?? '—'}
                </Text>
                <View style={styles.chips}>
                  <Chip
                    label={
                      c.hasYoutubeCredential ? `Connected, saved ${c.credentialAgeDays ?? 0}d ago` : 'Not connected'
                    }
                    tone={!c.hasYoutubeCredential ? 'neutral' : old ? 'warn' : 'ok'}
                  />
                </View>
                <Text style={styles.meta}>
                  {c.lastSnapshotAt ? `Last metrics ${fmtAgo(c.lastSnapshotAt)}` : 'No metrics yet'}
                </Text>
              </Card>
            );
          })}

          <SectionHeader title="Users" />
          {tenant.data.users.map((u) => (
            <Card key={u.id}>
              <Text style={styles.name} numberOfLines={1}>
                {u.email}
              </Text>
              <View style={styles.chips}>
                <Chip label={u.role === 'owner' ? 'Account owner' : humanize(u.role)} />
                {u.isPlatformAdmin ? <Chip label="Admin" tone="accent" /> : null}
              </View>
            </Card>
          ))}

          <SectionHeader title="Recent runs" />
          {tenant.data.recentRuns.length === 0 ? <EmptyView message="No runs yet" /> : null}
          {tenant.data.recentRuns.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </>
      ) : null}
    </AdminScreen>
  );
}

type BudgetData = AdminOutputs['budget']['get'];

function BudgetPanel({ b }: { b: BudgetData }) {
  const windowLabel =
    b.windowKind === 'weekly'
      ? `This week (resets ${fmtWeekdayTime(b.resetsAtUtc)})`
      : `Window: ${b.windowKind} (resets ${fmtWeekdayTime(b.resetsAtUtc)})`;
  return (
    <>
      <Card>
        <Text style={styles.meta}>{windowLabel}</Text>
        <Row label="Weekly budget (pool)" value={b.poolCeilingUsd === null ? 'Not set' : fmtUsd(b.poolCeilingUsd)} />
        <Row label="Counted by the gate" value={fmtUsd(b.gateSpentUsd)} />
        <Row label="Spent this week" value={fmtUsd(b.spentThisWeekUsd)} />
        <Row label="Reserved by overrides" value={fmtUsd(b.reservedByOverridesUsd)} />
        <Row label="Remaining in pool" value={fmtUsd(b.remainingPoolUsd)} />
      </Card>
      {/* Every warning is shown, never collapsed. */}
      {b.warnings.map((w, i) => (
        <Banner key={`${w.code}-${w.channelId ?? ''}-${i}`} kind="warning">
          {w.message}
        </Banner>
      ))}
      {b.channels.length === 0 ? <EmptyView message="No channels in the budget" /> : null}
      {b.channels.map((c) => {
        const s = CHANNEL_STATUS[c.status] ?? { label: humanize(c.status), tone: 'neutral' as ChipTone };
        return (
          <Card key={c.channelId}>
            <View style={styles.top}>
              <Text style={styles.name} numberOfLines={2}>
                {c.name}
              </Text>
              <Chip label={s.label} tone={s.tone} />
            </View>
            <Row label="Effective ceiling" value={c.effectiveCeilingUsd === null ? '—' : fmtUsd(c.effectiveCeilingUsd)} />
            <Row label="Spent (gate window)" value={fmtUsd(c.gateSpentUsd)} />
            {c.overrideUsd !== null ? <Row label="Override" value={fmtUsd(c.overrideUsd)} /> : null}
          </Card>
        );
      })}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function RunRow({
  run,
}: {
  run: {
    id: string;
    channelName: string;
    status: string;
    currentStage: string | null;
    lastError: string | null;
    updatedAt: string;
    costUsd: number;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/admin/run/[id]', params: { id: run.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Run on ${run.channelName}, ${statusLabel(run.status)}`}
    >
      <Card>
        <View style={styles.top}>
          <Chip label={statusLabel(run.status)} tone={statusTone(run.status)} />
          <Text style={styles.meta}>{fmtAgo(run.updatedAt)}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {run.channelName}
        </Text>
        <Text style={styles.meta}>
          {run.currentStage ? humanize(run.currentStage) : 'No stage'} · {fmtUsd(run.costUsd)}
        </Text>
        {run.lastError ? (
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Collapse error' : 'Expand error'}
            style={styles.errorHit}
          >
            <Text style={styles.error} numberOfLines={open ? undefined : 1}>
              {run.lastError}
            </Text>
          </Pressable>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { fontFamily: font.bold, fontSize: 16, color: color.ink, flex: 1 },
  meta: { ...type.meta },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  value: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  errorHit: { minHeight: 44, justifyContent: 'center' },
  error: { ...type.meta, color: color.danger },
});

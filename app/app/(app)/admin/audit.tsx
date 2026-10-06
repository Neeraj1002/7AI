import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { useIsAdmin, type AdminOutputs } from '../../../lib/use-admin';
import { color, font, radius, space, type } from '../../../lib/theme';
import { Card } from '../../../components/Card';
import { ActionButton } from '../../../components/admin/ActionButton';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { Chip } from '../../../components/admin/Chip';
import { LoadingView } from '../../../components/admin/LoadingView';
import { EmptyView } from '../../../components/admin/EmptyView';
import { ErrorView } from '../../../components/admin/ErrorView';
import { fmtAgo, fmtDate, shortId } from '../../../components/admin/format';

type Row = AdminOutputs['audit']['list']['items'][number];

const JSON_MAX = 1200;

function pretty(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = JSON.stringify(value, null, 2);
  return text.length > JSON_MAX ? `${text.slice(0, JSON_MAX)}…` : text;
}

function actorLabel(row: Row, myUserId: string | null): string {
  if (row.actorUserId && row.actorUserId === myUserId) return 'You';
  if (row.actorEmail) return row.actorEmail;
  if (row.actorKind === 'ops-token') return 'ops token';
  if (row.actorKind === 'script') return 'script';
  return row.actorKind;
}

export default function AdminAudit() {
  const trpc = useTRPC();
  const { userId } = useIsAdmin();
  const [action, setAction] = useState<string | null>(null);

  const log = useInfiniteQuery(
    trpc.admin.audit.list.infiniteQueryOptions(
      { limit: 50, ...(action ? { action } : {}) },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    ),
  );
  // Filter chips come from the unfiltered first page, so choosing one never hides the others.
  const firstPage = useQuery(trpc.admin.audit.list.queryOptions({ limit: 50 }));
  const actions = useMemo(() => [...new Set((firstPage.data?.items ?? []).map((r) => r.action))], [firstPage.data]);

  const rows = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AdminScreen title="Audit log">
      {actions.length > 0 ? (
        <View style={styles.chips}>
          <Chip label="All actions" selected={action === null} onPress={() => setAction(null)} />
          {actions.map((a) => (
            <Chip key={a} label={a} selected={action === a} onPress={() => setAction(action === a ? null : a)} />
          ))}
        </View>
      ) : null}
      {log.isLoading ? <LoadingView /> : null}
      {log.isError ? <ErrorView message="Couldn't load the audit log." onRetry={() => log.refetch()} /> : null}
      {log.data && rows.length === 0 ? <EmptyView message="No audit entries yet" /> : null}
      {rows.map((r) => (
        <AuditRow key={r.id} row={r} myUserId={userId} />
      ))}
      {log.hasNextPage ? (
        <ActionButton label="Load more" onPress={() => log.fetchNextPage()} loading={log.isFetchingNextPage} />
      ) : null}
    </AdminScreen>
  );
}

function AuditRow({ row, myUserId }: { row: Row; myUserId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={`${row.action} by ${actorLabel(row, myUserId)}, ${open ? 'collapse' : 'expand'} details`}
    >
      <Card>
        <View style={styles.top}>
          <Text style={styles.action}>{row.action}</Text>
          <Text style={styles.meta}>{fmtAgo(row.createdAt)}</Text>
        </View>
        <Text style={styles.meta}>
          {row.targetType}
          {row.targetId ? ` ${shortId(row.targetId)}` : ''} · by {actorLabel(row, myUserId)}
        </Text>
        {row.tenantName ? <Text style={styles.meta}>{row.tenantName}</Text> : null}
        {open ? (
          <View style={styles.detail}>
            <Text style={styles.meta}>{fmtDate(row.createdAt)}</Text>
            {row.reason ? <Text style={styles.meta}>Reason: {row.reason}</Text> : null}
            <Text style={styles.label}>Before</Text>
            <Text style={styles.mono}>{pretty(row.before)}</Text>
            <Text style={styles.label}>After</Text>
            <Text style={styles.mono}>{pretty(row.after)}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  action: { fontFamily: font.bold, fontSize: 15, color: color.ink, flexShrink: 1 },
  meta: { ...type.meta },
  detail: { gap: space.xs, marginTop: space.xs },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: color.ink,
    backgroundColor: color.surface2,
    padding: space.sm,
    borderRadius: radius.sm,
  },
});

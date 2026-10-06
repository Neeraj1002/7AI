import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import type { AdminOutputs } from '../../../lib/use-admin';
import { color, font, space, type } from '../../../lib/theme';
import { Card } from '../../../components/Card';
import { ActionButton } from '../../../components/admin/ActionButton';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { Banner } from '../../../components/admin/Banner';
import { Chip, type ChipTone } from '../../../components/admin/Chip';
import { LoadingView } from '../../../components/admin/LoadingView';
import { EmptyView } from '../../../components/admin/EmptyView';
import { ErrorView } from '../../../components/admin/ErrorView';
import { fmtAgo, humanize, shortId } from '../../../components/admin/format';
import { statusLabel } from '../../../components/admin/status';

type Bug = AdminOutputs['bugs']['list'][number];
type Options = AdminOutputs['bugs']['options'];
type TriageField = 'status' | 'area' | 'priority';

const UNTRIAGED = 'untriaged';

function bugStatusTone(status: string): ChipTone {
  if (status === 'fixed') return 'ok';
  if (status === 'awaiting_verification') return 'warn';
  if (status === 'open') return 'accent';
  return 'neutral';
}

export default function AdminBugs() {
  const trpc = useTRPC();
  const options = useQuery(trpc.admin.bugs.options.queryOptions());
  const [status, setStatus] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);

  const list = useQuery(
    trpc.admin.bugs.list.queryOptions({
      // Values come from options(); the server validates them. "untriaged" has no server
      // filter (area is null), so it is applied below.
      ...(status ? { status: status as Options['statuses'][number] } : {}),
      ...(reportType ? { reportType: reportType as Options['reportTypes'][number] } : {}),
      ...(area && area !== UNTRIAGED ? { area: area as Options['areas'][number] } : {}),
    }),
  );
  const bugs = (list.data ?? []).filter((b) => (area === UNTRIAGED ? b.area === null : true));

  return (
    <AdminScreen title="Bugs">
      {options.data ? (
        <>
          <FilterRow label="Status" all={status === null} onAll={() => setStatus(null)}>
            {options.data.statuses.map((s) => (
              <Chip key={s} label={statusLabel(s)} selected={status === s} onPress={() => setStatus(status === s ? null : s)} />
            ))}
          </FilterRow>
          <FilterRow label="Type" all={reportType === null} onAll={() => setReportType(null)}>
            {options.data.reportTypes.map((t) => (
              <Chip key={t} label={humanize(t)} selected={reportType === t} onPress={() => setReportType(reportType === t ? null : t)} />
            ))}
          </FilterRow>
          <FilterRow label="Area" all={area === null} onAll={() => setArea(null)}>
            {[...options.data.areas, UNTRIAGED].map((a) => (
              <Chip key={a} label={a === UNTRIAGED ? 'Untriaged' : a} selected={area === a} onPress={() => setArea(area === a ? null : a)} />
            ))}
          </FilterRow>
        </>
      ) : null}
      {options.isError ? <ErrorView message="Couldn't load the triage options." onRetry={() => options.refetch()} /> : null}

      {list.isLoading ? <LoadingView /> : null}
      {list.isError ? <ErrorView message="Couldn't load bug reports." onRetry={() => list.refetch()} /> : null}
      {list.data && bugs.length === 0 ? <EmptyView message="No bug reports match" /> : null}
      {options.data
        ? bugs.map((b) => <BugCard key={b.id} bug={b} options={options.data} />)
        : null}
    </AdminScreen>
  );
}

function FilterRow({
  label,
  all,
  onAll,
  children,
}: {
  label: string;
  all: boolean;
  onAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.meta}>{label}</Text>
      <View style={styles.chips}>
        <Chip label="All" selected={all} onPress={onAll} />
        {children}
      </View>
    </View>
  );
}

function BugCard({ bug, options }: { bug: Bug; options: Options }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<{ field: TriageField; value: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triage = useMutation(trpc.admin.bugs.updateTriage.mutationOptions());

  const apply = (field: TriageField, value: string | null) => {
    setError(null);
    setPending({ field, value });
    triage.mutate(
      { id: bug.id, [field]: value } as Parameters<typeof triage.mutate>[0],
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: trpc.admin.pathKey() });
          setPending(null);
        },
        onError: (e) => {
          // The chip never moved (no optimistic update), so "reverting" is clearing the pending state.
          setPending(null);
          setError(e.message || 'Could not save the change.');
        },
      },
    );
  };

  const isPending = (field: TriageField, value: string) => pending?.field === field && pending.value === value;

  return (
    <Card>
      <View style={styles.top}>
        <Text style={styles.id}>{shortId(bug.id)}</Text>
        <View style={styles.chips}>
          <Chip label={humanize(bug.reportType)} />
          {bug.priority ? <Chip label={humanize(bug.priority)} tone={bug.priority === 'blocker' ? 'danger' : 'neutral'} /> : null}
          <Chip label={statusLabel(bug.status)} tone={bugStatusTone(bug.status)} />
        </View>
      </View>
      <Text style={styles.meta}>
        Logged {fmtAgo(bug.createdAt)} · Area: {bug.area ?? 'Untriaged'}
      </Text>
      {bug.screenContext ? <Text style={styles.meta}>Screen: {bug.screenContext}</Text> : null}

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse report' : 'Expand report and triage'}
        style={styles.descHit}
      >
        <Text style={styles.desc} numberOfLines={expanded ? undefined : 4}>
          {bug.description}
        </Text>
      </Pressable>

      {bug.triageNote ? (
        <View style={styles.note}>
          <Text style={styles.noteLabel}>Note</Text>
          <Text style={styles.noteText}>{bug.triageNote}</Text>
        </View>
      ) : null}

      {bug.run ? (
        <ActionButton
          label="Open run"
          icon="external-link"
          onPress={() => router.push({ pathname: '/admin/run/[id]', params: { id: bug.run!.id } })}
        />
      ) : bug.runId ? (
        <Text style={styles.meta}>Run not found</Text>
      ) : null}

      {expanded ? (
        <View style={styles.triage}>
          <Text style={styles.noteLabel}>Status</Text>
          <View style={styles.chips}>
            {options.statuses.map((s) => (
              <Chip
                key={s}
                label={statusLabel(s)}
                selected={bug.status === s}
                pending={isPending('status', s)}
                disabled={triage.isPending}
                onPress={() => apply('status', s)}
              />
            ))}
          </View>
          <Text style={styles.noteLabel}>Area</Text>
          <View style={styles.chips}>
            {options.areas.map((a) => (
              <Chip
                key={a}
                label={a}
                selected={bug.area === a}
                pending={isPending('area', a)}
                disabled={triage.isPending}
                onPress={() => apply('area', a)}
              />
            ))}
          </View>
          <Text style={styles.noteLabel}>Priority</Text>
          <View style={styles.chips}>
            {options.priorities.map((p) => (
              <Chip
                key={p}
                label={humanize(p)}
                selected={bug.priority === p}
                pending={isPending('priority', p)}
                disabled={triage.isPending}
                onPress={() => apply('priority', p)}
              />
            ))}
          </View>
          {error ? <Banner kind="error">{error}</Banner> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  top: { gap: space.sm },
  id: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  meta: { ...type.meta },
  descHit: { minHeight: 44, justifyContent: 'center' },
  desc: { ...type.body, color: color.ink },
  note: { gap: 2, padding: space.md, borderRadius: 10, backgroundColor: color.surface2 },
  noteLabel: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  noteText: { ...type.body, fontSize: 14, color: color.ink },
  triage: { gap: space.xs, marginTop: space.xs },
});

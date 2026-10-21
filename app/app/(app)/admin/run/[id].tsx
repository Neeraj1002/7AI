import React from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../../lib/trpc';
import { isNotFoundError, type AdminOutputs } from '../../../../lib/use-admin';
import { color, font, space, type } from '../../../../lib/theme';
import { Card } from '../../../../components/Card';
import { ActionButton } from '../../../../components/admin/ActionButton';
import { AdminScreen } from '../../../../components/admin/AdminScreen';
import { Banner } from '../../../../components/admin/Banner';
import { Chip } from '../../../../components/admin/Chip';
import { ContentBlock } from '../../../../components/admin/ContentBlock';
import { SectionHeader } from '../../../../components/admin/SectionHeader';
import { LoadingView } from '../../../../components/admin/LoadingView';
import { EmptyView } from '../../../../components/admin/EmptyView';
import { ErrorView } from '../../../../components/admin/ErrorView';
import { fmtAgo, fmtDuration, fmtUsd, humanize, shortId } from '../../../../components/admin/format';
import { statusLabel, statusTone } from '../../../../components/admin/status';
import { adminStageLabel, groupUsage } from '../../../../lib/admin-cost';

type RunData = AdminOutputs['runs']['get'];

const ZERO_COST_NOTE = 'These calls recorded $0. If they should have cost something, spend is under-counted.';

async function copyId(id: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(id);
    } else {
      // No clipboard module is installed (JS-only task): the share sheet offers Copy.
      await Share.share({ message: id });
    }
  } catch {
    // Nothing to do: copying the id is a convenience.
  }
}

export default function AdminRunInspector() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  // admin.runs.get returns structure only. admin.runs.content is NEVER called from here.
  const run = useQuery({ ...trpc.admin.runs.get.queryOptions({ runId: id }), retry: false });

  if (run.isError && isNotFoundError(run.error)) {
    return (
      <AdminScreen title="Run">
        <EmptyView message="Run not found" />
        <ActionButton label="Back" onPress={() => router.back()} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Run" subtitle={id ? shortId(id) : undefined}>
      {run.isLoading ? <LoadingView /> : null}
      {run.isError ? <ErrorView message="Couldn't load this run." onRetry={() => run.refetch()} /> : null}
      {run.data ? <RunBody data={run.data} /> : null}
    </AdminScreen>
  );
}

function RunBody({ data }: { data: RunData }) {
  const { run, stages, usage, totals, gates, bundle } = data;
  const hasZero = usage.some((u) => u.zeroCost);
  const usageGroups = groupUsage(stages, usage);
  return (
    <>
      <Card>
        <Pressable
          onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: run.tenantId } })}
          accessibilityRole="button"
          accessibilityLabel={`Open tenant ${run.tenantName}`}
          style={styles.hit}
        >
          <Text style={styles.link}>{run.tenantName}</Text>
        </Pressable>
        <Text style={styles.name}>{run.channelName}</Text>
        <View style={styles.chips}>
          <Chip label={statusLabel(run.status)} tone={statusTone(run.status)} />
          {run.currentStage ? <Chip label={humanize(run.currentStage)} /> : null}
        </View>
        <Text style={styles.meta}>
          Created {fmtAgo(run.createdAt)} · updated {fmtAgo(run.updatedAt)}
        </Text>
        <Pressable
          onLongPress={() => copyId(run.id)}
          accessibilityRole="button"
          accessibilityLabel={`Run id ${shortId(run.id)}. Long press to copy the full id.`}
          style={styles.hit}
        >
          <Text style={styles.meta}>Run {shortId(run.id)} (long-press to copy)</Text>
        </Pressable>
        {run.lastError ? <Banner kind="error">{run.lastError}</Banner> : null}
        {run.creationOptionKeys.length > 0 ? (
          <View style={styles.chips}>
            {run.creationOptionKeys.map((k) => (
              <Chip key={k} label={k} />
            ))}
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Stages" />
      <Text style={styles.meta}>Stage output is shown only when you tap Show content on a stage.</Text>
      {stages.length === 0 ? <EmptyView message="No stages yet" /> : null}
      {stages.map((s) => (
        <Card key={`${s.stageName}-${s.attemptNumber}`}>
          <View style={styles.top}>
            <Text style={styles.name}>{adminStageLabel(s.stageName)}</Text>
            <Chip label={statusLabel(s.status)} tone={statusTone(s.status)} />
          </View>
          <Text style={styles.meta}>
            Attempt {s.attemptNumber} of {stages.filter((x) => x.stageName === s.stageName).length}
            {s.startedAt && s.finishedAt
              ? ` · ${fmtDuration((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}`
              : ''}
          </Text>
          {s.reason ? <Text style={styles.reason}>{s.reason}</Text> : null}
          {s.outputKeys.length > 0 ? (
            <View style={styles.chips}>
              {s.outputKeys.map((k) => (
                <Chip key={k} label={k} />
              ))}
            </View>
          ) : null}
          {s.qualityMetrics ? (
            <View style={styles.quality}>
              <Text style={styles.label}>Quality</Text>
              {Object.entries(s.qualityMetrics).map(([k, v]) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.meta}>{k}</Text>
                  <Text style={styles.value}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <ContentBlock label="Stage output" input={{ runId: run.id, kind: 'stage_output', stageName: s.stageName, attemptNumber: s.attemptNumber }} />
        </Card>
      ))}

      <SectionHeader title="Cost" />
      <Card>
        <View style={styles.row}>
          <Text style={styles.meta}>Total</Text>
          <Text style={styles.value}>{fmtUsd(totals.costUsd)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Events</Text>
          <Text style={styles.value}>{totals.events}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>$0 events</Text>
          <Text style={styles.value}>{totals.zeroCostEvents}</Text>
        </View>
      </Card>
      {hasZero ? <Banner kind="warning">{ZERO_COST_NOTE}</Banner> : null}
      {usage.length === 0 ? <EmptyView message="No usage recorded for this run" /> : null}
      {/* Sprint 5 Task 7 R2: events grouped by the stage attempt they happened in, with subtotals that add up to the total. */}
      {usageGroups.groups.map((g) => (
        <View key={g.key} style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.label}>
              {g.stageName ? `${adminStageLabel(g.stageName)} · attempt ${g.attemptNumber}` : 'Before the first stage'}
            </Text>
            <Text style={styles.value}>{fmtUsd(g.subtotalUsd)}</Text>
          </View>
          {g.events.map((u, i) => (
            <Card key={`${u.at}-${i}`}>
              <View style={styles.top}>
                <Text style={styles.name}>{u.agent}</Text>
                {u.zeroCost ? <Chip label="$0" tone="warn" /> : <Text style={styles.value}>{fmtUsd(u.costUsd)}</Text>}
              </View>
              <Text style={styles.meta}>
                {u.provider === 'unknown' && u.model === 'unknown' ? 'provider and model not recorded' : `${u.provider} / ${u.model}`} · {fmtAgo(u.at)}
              </Text>
              {u.metadataKeys.length > 0 ? (
                <View style={styles.chips}>
                  {u.metadataKeys.map((k) => (
                    <Chip key={k} label={k} />
                  ))}
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      ))}
      {usage.length > 0 ? (
        <Text style={styles.meta}>
          Subtotals {fmtUsd(usageGroups.totalUsd)} · total {fmtUsd(totals.costUsd)}
          {Math.abs(usageGroups.totalUsd - totals.costUsd) < 0.00005 ? ' · they match' : ' · DO NOT MATCH'}
        </Text>
      ) : null}

      <SectionHeader title="Review gates" />
      {gates.length === 0 ? <EmptyView message="No gate decisions yet" /> : null}
      {gates.map((g, i) => (
        <Card key={`${g.gate}-${i}`}>
          <View style={styles.top}>
            <Text style={styles.name}>Gate {g.gate}</Text>
            <Chip label={humanize(g.decision)} />
          </View>
          <Text style={styles.meta}>{fmtAgo(g.at)}</Text>
        </Card>
      ))}

      <SectionHeader title="Debug bundle" />
      <Text style={styles.body}>
        {bundle.attempts.length > 0
          ? `Bundle available for attempt${bundle.attempts.length === 1 ? '' : 's'} ${bundle.attempts.join(', ')}`
          : 'No debug bundle for this run'}
      </Text>

      <SectionHeader title="Show content" />
      <Banner kind="info">Viewing tenant content is recorded in the audit log.</Banner>
      <ContentBlock label="Brief" input={{ runId: run.id, kind: 'brief' }} />
      {bundle.attempts.map((n) => (
        <ContentBlock key={n} label={`Bundle manifest, attempt ${n}`} input={{ runId: run.id, kind: 'bundle_manifest', attemptNumber: n }} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  hit: { minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: font.bold, fontSize: 16, color: color.ink, flexShrink: 1 },
  link: { fontFamily: font.bold, fontSize: 16, color: color.accentText, textDecorationLine: 'underline' },
  meta: { ...type.meta },
  body: { ...type.body, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  value: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  reason: { ...type.body, fontSize: 14, color: color.warnText },
  quality: { gap: 2, marginTop: space.xs },
  group: { gap: space.sm, marginTop: space.sm },
});

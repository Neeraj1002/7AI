import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { color, font, space } from '../lib/theme';
import { Card } from './Card';
import { IndeterminateBar } from './IndeterminateBar';
import { endedTitle, needsAttentionText, plainReason, spentLine, stagePhrase, type EndReason, type StageLike } from '../lib/run-view';

// The status card of the Run screen's states (NEXT 1 states board). Same layout in every state; only this card and
// the action bar change.

export function NeedsAttentionCard({
  stage,
  stages,
  lastError,
  extra,
}: {
  stage: string | null | undefined;
  stages: StageLike[];
  lastError: string | null | undefined;
  /** Run-specific next-step sentence (e.g. what the retry limit means for this run), shown under the helper. */
  extra?: string | null;
}) {
  const [raw, setRaw] = useState(false);
  return (
    <View style={[styles.card, styles.attention]}>
      <Text style={styles.title}>What went wrong</Text>
      <Text style={styles.body}>{needsAttentionText({ stage, stages, lastError })}</Text>
      <Text style={styles.meta}>Retry runs this step again. Cancel stops the run; nothing is published.</Text>
      {extra ? <Text style={styles.meta}>{extra}</Text> : null}
      {lastError ? (
        <>
          <Pressable onPress={() => setRaw((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: raw }} style={styles.link}>
            <Text style={styles.linkText}>Technical details ›</Text>
          </Pressable>
          {raw ? <Text style={styles.raw}>{lastError}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

export function EndedCard({
  endReason,
  rejectedGate,
  reason,
  lastError,
  spentUsd,
}: {
  endReason: EndReason;
  rejectedGate: number | undefined;
  reason: string | undefined;
  lastError: string | null | undefined;
  spentUsd: number | undefined;
}) {
  const stopped = endReason !== 'cancelled' && endReason !== 'rejected';
  return (
    <Card>
      <Text style={styles.title}>{endedTitle(endReason, rejectedGate)}</Text>
      <Text style={styles.meta}>Nothing was published.{spentLine(spentUsd)}</Text>
      {endReason === 'rejected' && reason ? <Text style={styles.meta}>&quot;{reason}&quot;</Text> : null}
      {stopped && endReason !== 'channel_deleted' && lastError ? <Text style={styles.meta}>{plainReason(lastError)}</Text> : null}
    </Card>
  );
}

// `runs.progress` returns `{ stage, attemptNo }` and no percentage or time estimate, so the bar is indeterminate.
export function InProgressCard({ runId, currentStage, maxCostUsd }: { runId: string; currentStage: string | null | undefined; maxCostUsd?: number }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.runs.progress.queryOptions({ runId }, { refetchInterval: 5_000 }));
  const stage = data?.stage ?? currentStage;
  const attempt = data?.attemptNo;
  return (
    <View style={[styles.card, styles.dark]}>
      <Text style={[styles.title, styles.onDark]}>{stagePhrase(stage)}</Text>
      <IndeterminateBar />
      <Text style={styles.darkMeta}>
        {attempt ? `Attempt ${attempt} · ` : ''}This screen updates on its own.{maxCostUsd !== undefined ? ` Stops at $${maxCostUsd.toFixed(2)}.` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 16, padding: space.lg, gap: space.sm },
  attention: { borderColor: color.warnText, backgroundColor: color.warnSoft },
  dark: { borderColor: color.ink, backgroundColor: color.ink },
  title: { fontFamily: font.black, fontSize: 16, lineHeight: 20, color: color.ink },
  onDark: { color: color.onAccent },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: color.muted },
  darkMeta: { fontFamily: font.semibold, fontSize: 13, lineHeight: 19, color: color.future },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: font.black, fontSize: 13, color: color.accent },
  raw: { fontFamily: font.regular, fontSize: 12, color: color.muted },
});

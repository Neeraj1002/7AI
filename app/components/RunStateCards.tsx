import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { color, font, space } from '../lib/theme';
import { Card } from './Card';
import { IndeterminateBar } from './IndeterminateBar';
import { LONG_WAIT_NOTE, imageStageFraction, imageStageLine } from '../lib/long-video';
import { endedTitle, needsAttentionText, plainReason, spentLine, stagePhrase, type EndReason, type StageLike } from '../lib/run-view';
import { describeFailure } from '../lib/failure-text';
import { PrimaryButton } from './Buttons';

// The status card of the Run screen's states (NEXT 1 states board). Same layout in every state; only this card and
// the action bar change.

export function NeedsAttentionCard({
  stage,
  stages,
  lastError,
  extra,
  spentUsd,
  maxCostUsd,
  reviewReason,
  videoAttempts,
  onRaiseLimit,
}: {
  stage: string | null | undefined;
  stages: StageLike[];
  lastError: string | null | undefined;
  /** Run-specific next-step sentence (e.g. what the retry limit means for this run), shown under the helper. */
  extra?: string | null;
  spentUsd?: number;
  maxCostUsd?: number;
  /** The video reviewer's own reason for the latest failed review. */
  reviewReason?: string;
  videoAttempts?: number;
  /** Opens the control that raises the spend limit; shown on a spend-limit stop (Sprint 5 Task 7 R5). */
  onRaiseLimit?: () => void;
}) {
  const [raw, setRaw] = useState(false);
  const failure = describeFailure(lastError, { spentUsd, maxCostUsd, reviewReason, tries: videoAttempts });
  return (
    <View style={[styles.card, styles.attention]}>
      <Text style={styles.title}>What went wrong</Text>
      {failure.kind === 'other' ? (
        <Text style={styles.body}>{needsAttentionText({ stage, stages, lastError })}</Text>
      ) : (
        <>
          <Text style={styles.body}>{failure.title}</Text>
          {failure.detail ? <Text style={styles.meta}>{failure.detail}</Text> : null}
        </>
      )}
      {failure.fix === 'limit' && onRaiseLimit ? <PrimaryButton label="Raise the limit and retry" icon="trending-up" onPress={onRaiseLimit} /> : null}
      <Text style={styles.meta}>Retry runs this step again. Cancel stops the run; nothing is published.</Text>
      {extra ? <Text style={styles.meta}>{extra}</Text> : null}
      {lastError ? (
        <>
          <Pressable onPress={() => setRaw((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: raw }} style={styles.link}>
            <Text style={styles.linkText}>Technical details ›</Text>
          </Pressable>
          {raw ? <Text style={styles.raw} selectable>{failure.technical}</Text> : null}
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

// `runs.progress` returns `{ stage, attemptNo }` and, while stills are generated, `{ done, total }`; never a
// percentage or a time estimate. A long video shows the image count when the server sends it, else an indeterminate bar.
export function InProgressCard({
  runId,
  currentStage,
  maxCostUsd,
  isLong,
}: {
  runId: string;
  currentStage: string | null | undefined;
  maxCostUsd?: number;
  isLong?: boolean;
}) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.runs.progress.queryOptions({ runId }, { refetchInterval: 5_000 }));
  const stage = data?.stage ?? currentStage;
  const attempt = data?.attemptNo;
  const imageStage = Boolean(isLong) && stage === 'video_generation';
  const fraction = imageStage ? imageStageFraction(data) : null;
  return (
    <View style={[styles.card, styles.dark]}>
      <Text style={[styles.title, styles.onDark]}>{imageStage ? imageStageLine(data) : stagePhrase(stage)}</Text>
      {fraction !== null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      ) : (
        <IndeterminateBar />
      )}
      {isLong ? <Text style={styles.darkMeta}>{LONG_WAIT_NOTE}</Text> : null}
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
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: color.accent },
});

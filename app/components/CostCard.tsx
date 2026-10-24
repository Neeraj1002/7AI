import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, radius, space, type } from '../lib/theme';
import { attemptsAddUp, formatMoney, stageCostText, stageDisplayName, type CostBreakdown, type CostEntry } from '../lib/run-cost';
import { OUTCOME_LABEL, type OutcomeKind } from '../lib/attempt-outcome';

// What this run has cost (Sprint 5 Task 7 R2, follow-up R2). Collapsed: the total, a bar, "Estimate · limit · attempts" and
// "Show cost per attempt". Expanded: each attempt with its outcome and cost and, indented under it, its stages; a call that
// failed and cost $0 reads "failed, not charged". Step history shows outcome and reason only, so no amount is repeated there.
export function CostCard({
  spentUsd,
  limitUsd,
  estimateUsd,
  retryAllowanceUsd,
  ended,
  attemptsCount,
  breakdown,
}: {
  spentUsd: number;
  limitUsd?: number | null;
  estimateUsd?: number | null;
  /** What automatic retries may spend in all (Task 8 R8); past it the run waits for a person. */
  retryAllowanceUsd?: number | null;
  /** The run is finished (published, failed or cancelled): the figure is final. */
  ended: boolean;
  attemptsCount?: number;
  /** Per attempt and per stage, from `runs.get`; null on an older server or a run from before it. */
  breakdown?: CostBreakdown | null;
}) {
  const [open, setOpen] = useState(false);
  const fraction = limitUsd && limitUsd > 0 ? Math.min(1, spentUsd / limitUsd) : null;
  const over = limitUsd != null && spentUsd >= limitUsd;
  // Running: amber while it is still being spent; finished: green; at the limit: red.
  const barColor = over ? color.danger : ended ? color.okText : color.amber;
  const extra = [
    estimateUsd != null ? `Estimate ${formatMoney(estimateUsd)}` : null,
    retryAllowanceUsd != null ? `Retries up to ${formatMoney(retryAllowanceUsd)}` : null,
    limitUsd != null ? `Limit ${formatMoney(limitUsd)}` : null,
    attemptsCount && attemptsCount > 1 ? `${attemptsCount} attempts` : null,
  ].filter(Boolean);
  const hasParts = breakdown != null && (breakdown.attempts.length > 0 || breakdown.others.length > 0);
  const recorded = breakdown != null || spentUsd > 0;

  return (
    <View style={styles.card}>
      <View style={styles.row} accessible accessibilityLabel={`${ended ? 'Final cost' : 'Cost so far'} ${formatMoney(spentUsd)}`}>
        <Text style={styles.label}>{ended ? 'Final cost' : 'Cost so far'}</Text>
        <Text style={styles.amount}>{recorded ? formatMoney(spentUsd) : 'Not recorded for this run'}</Text>
      </View>
      {fraction !== null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: barColor }]} />
        </View>
      ) : null}
      {extra.length > 0 ? <Text style={styles.meta}>{extra.join(' · ')}</Text> : null}

      {hasParts ? (
        <>
          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.toggle}>
            <Text style={styles.toggleText}>{open ? 'Hide cost per attempt ▲' : 'Show cost per attempt ▼'}</Text>
          </Pressable>
          {open ? <Parts breakdown={breakdown!} /> : null}
        </>
      ) : null}
    </View>
  );
}

function outcomeWord(kind: string | undefined): string {
  return kind && kind in OUTCOME_LABEL ? OUTCOME_LABEL[kind as OutcomeKind] : '';
}

function Parts({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <View style={styles.parts}>
      {breakdown.attempts.map((a) => (
        <Attempt key={`${a.stageName}:${a.attemptNumber}`} entry={a} />
      ))}
      {breakdown.others.length > 0 ? (
        <>
          <Text style={styles.group}>Other steps</Text>
          {breakdown.others.map((o) => {
            const notCharged = o.cost.failed && o.cost.totalUsd === 0;
            return (
              <View key={`${o.stageName}:${o.attemptNumber}`} style={styles.line}>
                <Text style={[styles.stage, notCharged && styles.notCharged]}>
                  {stageDisplayName(o.stageName)}
                  {o.attemptNumber > 1 ? ` (try ${o.attemptNumber})` : ''}
                </Text>
                <Text style={[styles.stageAmount, notCharged && styles.notCharged]}>{stageCostText({ name: '', usd: o.cost.totalUsd, failed: o.cost.failed })}</Text>
              </View>
            );
          })}
        </>
      ) : null}
      {breakdown.unattributedUsd > 0 ? (
        <View style={styles.line}>
          <Text style={styles.stage}>Not tied to a step</Text>
          <Text style={styles.stageAmount}>{formatMoney(breakdown.unattributedUsd)}</Text>
        </View>
      ) : null}
      {!attemptsAddUp(breakdown) ? <Text style={styles.warn}>These parts do not add up to the total.</Text> : null}
    </View>
  );
}

function Attempt({ entry }: { entry: CostEntry }) {
  const word = outcomeWord(entry.outcome);
  return (
    <View style={styles.attempt}>
      <View style={styles.line}>
        <Text style={styles.attemptTitle}>
          Attempt {entry.attemptNumber}
          {word ? ` · ${word}` : ''}
        </Text>
        <Text style={styles.attemptAmount}>{formatMoney(entry.cost.totalUsd)}</Text>
      </View>
      {entry.cost.stages.map((st) => {
        const notCharged = st.failed && st.usd === 0;
        return (
          <View key={st.name} style={[styles.line, styles.indent]}>
            <Text style={[styles.stage, notCharged && styles.notCharged]}>{st.name}</Text>
            <Text style={[styles.stageAmount, notCharged && styles.notCharged]}>{stageCostText(st)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: color.surface2 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  label: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  amount: { fontFamily: font.black, fontSize: 17, color: color.ink, flexShrink: 1, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, backgroundColor: color.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  meta: { ...type.meta, fontSize: 12 },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  toggleText: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  parts: { gap: space.sm },
  attempt: { gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  indent: { paddingLeft: space.md },
  attemptTitle: { fontFamily: font.bold, fontSize: 13, color: color.ink, flexShrink: 1 },
  attemptAmount: { fontFamily: font.black, fontSize: 13, color: color.ink },
  group: { fontFamily: font.bold, fontSize: 12, color: color.muted, textTransform: 'uppercase', marginTop: space.xs },
  stage: { ...type.meta, fontSize: 12, flexShrink: 1 },
  stageAmount: { fontFamily: font.semibold, fontSize: 12, color: color.ink },
  notCharged: { color: color.muted, fontStyle: 'italic' },
  warn: { fontFamily: font.bold, fontSize: 12, color: color.warnText },
});

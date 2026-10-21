import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color, font, radius, space, type } from '../lib/theme';
import { formatMoney } from '../lib/run-cost';

// Sprint 5 Task 7 R2 — what this run has cost: spent so far (the final cost once it ends), the estimate and the limit.
// Per-attempt and per-stage amounts are in Step history, under each attempt.
export function CostCard({
  spentUsd,
  limitUsd,
  estimateUsd,
  retryAllowanceUsd,
  ended,
  attemptsCount,
}: {
  spentUsd: number;
  limitUsd?: number | null;
  estimateUsd?: number | null;
  /** What automatic retries may spend in all (Task 8 R8); past it the run waits for a person. */
  retryAllowanceUsd?: number | null;
  /** The run is finished (published, failed or cancelled): the figure is final. */
  ended: boolean;
  attemptsCount?: number;
}) {
  const fraction = limitUsd && limitUsd > 0 ? Math.min(1, spentUsd / limitUsd) : null;
  const over = limitUsd != null && spentUsd >= limitUsd;
  const extra = [
    estimateUsd != null ? `Estimate ${formatMoney(estimateUsd)}` : null,
    retryAllowanceUsd != null ? `Retries up to ${formatMoney(retryAllowanceUsd)}` : null,
    limitUsd != null ? `Limit ${formatMoney(limitUsd)}` : null,
    attemptsCount && attemptsCount > 1 ? `${attemptsCount} attempts` : null,
  ].filter(Boolean);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${ended ? 'Final cost' : 'Spent so far'} ${formatMoney(spentUsd)}`}>
      <View style={styles.row}>
        <Text style={styles.label}>{ended ? 'Final cost' : 'Spent so far'}</Text>
        <Text style={styles.amount}>{spentUsd === 0 ? 'Nothing booked' : formatMoney(spentUsd)}</Text>
      </View>
      {fraction !== null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: over ? color.danger : color.okText }]} />
        </View>
      ) : null}
      {extra.length > 0 ? <Text style={styles.meta}>{extra.join(' · ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: color.surface2 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  label: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  amount: { fontFamily: font.black, fontSize: 17, color: color.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: color.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  meta: { ...type.meta, fontSize: 12 },
});

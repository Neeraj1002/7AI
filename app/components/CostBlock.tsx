import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, font, radius, space, type } from '../lib/theme';
import {
  ESTIMATE_FAILED,
  MAX_SPEND_HELPER,
  estimateHelper,
  formatUsd,
  weeklyBudgetBlocked,
  weeklyBudgetText,
  type CostEstimate,
} from '../lib/long-brief';

// Sprint 4 FE N3 R1 — the Video cost block on New brief: estimate card, weekly-budget error, the estimate-failed
// state with Retry, and the Max spend field. All figures come from runs.estimateCost.
export function CostBlock({
  state,
  estimate,
  maxSpend,
  maxSpendError,
  onChangeMaxSpend,
  onRetry,
  budgetServerError,
  maxSpendServerError,
}: {
  state: 'estimating' | 'failed' | 'ready';
  estimate: CostEstimate | undefined;
  maxSpend: string;
  maxSpendError: string | null;
  onChangeMaxSpend: (text: string) => void;
  onRetry: () => void;
  /** A runs.create BAD_REQUEST about the weekly budget, in the server's words. */
  budgetServerError?: string | null;
  /** A runs.create BAD_REQUEST about the spend limit, in the server's words. */
  maxSpendServerError?: string | null;
}) {
  const blocked = state === 'ready' && estimate !== undefined && weeklyBudgetBlocked(estimate);
  const spendError = maxSpendError ?? maxSpendServerError ?? null;
  return (
    <View style={styles.wrap}>
      {state === 'estimating' ? (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>Estimating…</Text>
            <ActivityIndicator size="small" color={color.muted} />
          </View>
        </View>
      ) : state === 'failed' ? (
        <View style={[styles.card, styles.cardError]}>
          <Text style={[styles.cardTitle, styles.errorText]}>{ESTIMATE_FAILED}</Text>
          <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : estimate && blocked ? (
        <View style={[styles.card, styles.cardError]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardTitle, styles.errorText, styles.flex]}>Not enough weekly budget</Text>
            <Text style={[styles.amount, styles.errorText]}>{formatUsd(estimate.estimateUsd)}</Text>
          </View>
          <Text style={[styles.helper, styles.errorText]}>{weeklyBudgetText(estimate)}</Text>
        </View>
      ) : estimate ? (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardTitle, styles.flex]}>Estimated cost</Text>
            <Text style={styles.amount}>{formatUsd(estimate.estimateUsd)}</Text>
          </View>
          <Text style={styles.helper}>{estimateHelper(estimate)}</Text>
        </View>
      ) : null}
      {budgetServerError ? <Text style={[styles.helper, styles.errorText]}>{budgetServerError}</Text> : null}

      <View style={styles.spendRow}>
        <Text style={styles.spendLabel}>Max spend for this video</Text>
        <View style={[styles.spendField, spendError ? styles.spendFieldError : null]}>
          <Text style={styles.spendPrefix}>$</Text>
          <TextInput
            style={styles.spendInput}
            value={maxSpend}
            onChangeText={onChangeMaxSpend}
            keyboardType="decimal-pad"
            selectionColor={color.accent}
            cursorColor={color.accent}
            accessibilityLabel="Max spend for this video, in dollars"
          />
        </View>
      </View>
      <Text style={[styles.helper, spendError ? styles.errorText : null]}>{spendError ?? MAX_SPEND_HELPER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  flex: { flex: 1 },
  card: { gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: color.surface2 },
  cardError: { backgroundColor: color.accentSoft, borderWidth: 1.5, borderColor: color.danger },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  cardTitle: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  amount: { fontFamily: font.black, fontSize: 17, color: color.ink },
  helper: { ...type.meta, fontSize: 12, lineHeight: 17 },
  errorText: { color: color.danger },
  retry: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  retryText: { fontFamily: font.bold, fontSize: 13, color: color.onAccent },
  spendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spendLabel: { flex: 1, fontFamily: font.bold, fontSize: 14, color: color.ink },
  spendField: {
    width: 112,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.surface,
  },
  spendFieldError: { borderWidth: 2, borderColor: color.danger },
  spendPrefix: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  spendInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontFamily: font.bold, fontSize: 15, color: color.ink },
});

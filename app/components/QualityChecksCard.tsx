import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, space, type } from '../lib/theme';
import { Card } from './Card';
import { parseQualityMetrics, type QualityRowStatus } from '../lib/quality-checks';

const ICON: Record<QualityRowStatus, { name: keyof typeof Feather.glyphMap; fg: string }> = {
  ok: { name: 'check-circle', fg: color.okText },
  warn: { name: 'alert-circle', fg: color.warnText },
  fail: { name: 'x-circle', fg: color.danger },
};

// Sprint 4 FE E1 — Gate 2 "Quality checks", from `runs.get().qualityMetrics`. Colours and messages come from
// the server's per-row `{ warn, message }`; rows the server omits are not applicable and are hidden.
// Renders nothing when there are no measured metrics (older runs).
export function QualityChecksCard({ qualityMetrics }: { qualityMetrics: unknown }) {
  const checks = parseQualityMetrics(qualityMetrics);
  if (!checks) return null;
  return (
    <Card>
      <Text style={styles.title}>Quality checks</Text>
      <Text style={styles.meta}>
        Measured on the final file. Red items block the video automatically; amber items are for your judgement.
      </Text>
      {checks.rows.map((row) => {
        const icon = ICON[row.status];
        return (
          <View key={row.key} style={styles.rowWrap}>
            <View style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
              <Feather name={icon.name} size={18} color={icon.fg} />
              <Text style={styles.label}>{row.label}</Text>
              <Text style={[styles.value, row.status === 'warn' && styles.valueWarn, row.status === 'fail' && styles.valueFail]}>
                {row.value}
              </Text>
            </View>
            {row.message ? <Text style={styles.message}>{row.message}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...type.sectionTitle, color: color.ink },
  rowWrap: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  label: { ...type.meta, flex: 1 },
  meta: { ...type.meta },
  value: { ...type.meta, color: color.okText, fontWeight: '700' },
  valueWarn: { color: color.warnText },
  valueFail: { color: color.danger },
  message: { ...type.meta, fontSize: 12, color: color.warnText, paddingLeft: 18 + space.sm },
});

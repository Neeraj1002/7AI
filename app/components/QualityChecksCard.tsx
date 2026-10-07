import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, radius, space, type } from '../lib/theme';
import { Card } from './Card';
import { parseQualityMetrics, type QualityRowStatus } from '../lib/quality-checks';

const ICON: Record<QualityRowStatus, { name: keyof typeof Feather.glyphMap; fg: string }> = {
  ok: { name: 'check-circle', fg: color.okText },
  warn: { name: 'alert-circle', fg: color.warnText },
  fail: { name: 'x-circle', fg: color.danger },
};

// Sprint 4 FE E1 — Gate 2 "Quality checks". Renders nothing for runs without `qualityMetrics`.
export function QualityChecksCard({ videoReviewOutput }: { videoReviewOutput: Record<string, unknown> | null | undefined }) {
  const checks = parseQualityMetrics(videoReviewOutput);
  if (!checks) return null;
  return (
    <Card>
      <Text style={styles.title}>Quality checks</Text>
      {checks.rows.map((row) => {
        const icon = ICON[row.status];
        return (
          <View key={row.key} style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
            <Feather name={icon.name} size={18} color={icon.fg} />
            <Text style={styles.label}>{row.label}</Text>
            <Text style={[styles.value, row.status === 'fail' && styles.valueFail]}>{row.value}</Text>
          </View>
        );
      })}
      {checks.softWarnings.length > 0 ? (
        <View style={styles.note}>
          {checks.softWarnings.map((w, i) => (
            <Text key={i} style={styles.noteText}>
              {w}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...type.sectionTitle, color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  label: { ...type.meta, flex: 1 },
  value: { ...type.meta, color: color.ink },
  valueFail: { color: color.danger },
  note: { backgroundColor: color.warnBg, borderRadius: radius.sm, padding: space.sm, gap: space.xs },
  noteText: { ...type.meta, color: color.warnText },
});

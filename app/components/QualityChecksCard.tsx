import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color, font, type } from '../lib/theme';
import { Card } from './Card';
import { parseQualityMetrics, type QualityRowStatus } from '../lib/quality-checks';

// Board "Gate 2 — quality checks": a 20px filled circle with ✓ / ! / ✕, the value on the right in the same colour.
const BADGE: Record<QualityRowStatus, { glyph: string; bg: string; fg: string }> = {
  ok: { glyph: '✓', bg: color.okText, fg: color.okText },
  warn: { glyph: '!', bg: color.warnText, fg: color.warnText },
  fail: { glyph: '✕', bg: color.danger, fg: color.danger },
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
      <Text style={styles.intro}>
        Measured on the final file. Red items block the video automatically; amber items are for your judgement.
      </Text>
      {checks.rows.map((row) => {
        const badge = BADGE[row.status];
        return (
          <View key={row.key} style={styles.rowWrap}>
            <View style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={styles.badgeGlyph}>{badge.glyph}</Text>
              </View>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={[styles.value, { color: badge.fg }]}>{row.value}</Text>
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
  intro: { ...type.meta, lineHeight: 19 },
  rowWrap: { borderTopWidth: 1, borderTopColor: color.border, paddingVertical: 7, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeGlyph: { fontFamily: font.black, fontSize: 12, color: color.onAccent },
  label: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink },
  value: { fontFamily: font.bold, fontSize: 13 },
  message: { ...type.meta, fontSize: 12, color: color.warnText, paddingLeft: 30 },
});

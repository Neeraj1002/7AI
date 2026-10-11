import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../Card';
import { color, space, type } from '../../lib/theme';

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, gap: space.xs },
  label: { ...type.meta },
  value: { ...type.stat, color: color.ink },
  sub: { ...type.meta },
});

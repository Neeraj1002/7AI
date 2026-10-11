import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { color, font, radius, space } from '../lib/theme';
import type { SettingTile } from '../lib/run-view';

// Settings the run used (NEXT 1 Run board). Two columns; one column below 340 px or at font scale 1.3 and above.
export function RunSettingsTiles({ tiles, formatLine }: { tiles: SettingTile[]; formatLine: string | null }) {
  const { width, fontScale } = useWindowDimensions();
  const oneColumn = width < 340 || fontScale >= 1.3;
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.key} style={[styles.tile, oneColumn ? styles.tileFull : styles.tileHalf]}>
            <Text style={styles.label}>{t.label}</Text>
            <Text style={styles.value}>{t.value}</Text>
          </View>
        ))}
      </View>
      {formatLine ? <Text style={styles.format}>{formatLine}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { backgroundColor: color.surface2, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: space.md, gap: 2 },
  tileHalf: { width: '48.5%', flexGrow: 1 },
  tileFull: { width: '100%' },
  label: { fontFamily: font.bold, fontSize: 11, color: color.muted },
  value: { fontFamily: font.black, fontSize: 14, color: color.ink },
  format: { fontFamily: font.regular, fontSize: 12, color: color.muted },
});

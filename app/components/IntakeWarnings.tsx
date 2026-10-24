import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color, font, radius, space } from '../lib/theme';

// Plain amber lines under the brief (follow-up R4): advice from intake, never an error and never blocking.
export function IntakeWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      {warnings.map((w) => (
        <Text key={w} style={styles.text}>
          {w}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: color.warnSoft, borderWidth: 1, borderColor: color.amber },
  text: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.warnText },
});

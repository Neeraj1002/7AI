import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color, font, space } from '../lib/theme';
import { STEPPER_STEPS } from '../lib/run-labels';

// Slim stepper (NEXT 1 Run board): seven 4 px bars with a label under each, one line. Bars up to and including the
// current step are filled; the current step turns amber when the run needs attention or has ended there.
export function Stepper({ currentIndex, attention, ended }: { currentIndex: number; attention?: boolean; ended?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${Math.min(currentIndex + 1, STEPPER_STEPS.length)} of ${STEPPER_STEPS.length}: ${STEPPER_STEPS[Math.min(currentIndex, STEPPER_STEPS.length - 1)]}`}>
      {STEPPER_STEPS.map((label, i) => {
        const filled = i <= currentIndex;
        const stuck = i === currentIndex && (attention || ended);
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.bar, filled && styles.barDone, stuck && styles.barStuck]} />
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  step: { flex: 1, alignItems: 'center', gap: space.xs },
  bar: { width: '100%', height: 4, borderRadius: 2, backgroundColor: color.border },
  barDone: { backgroundColor: color.accent },
  barStuck: { backgroundColor: color.amber },
  label: { fontFamily: font.bold, fontSize: 10, color: color.muted, textAlign: 'center' },
});

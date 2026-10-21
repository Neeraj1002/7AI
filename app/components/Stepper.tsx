import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { color, font, space } from '../lib/theme';
import { STEPPER_STEPS } from '../lib/run-labels';
import { barColors, type StepperEnd } from '../lib/stepper-colors';

// Slim stepper (NEXT 1 Run board): seven 4 px bars with a label under each, one line.
// Colours: see lib/stepper-colors.ts (Sprint 5 Task 7 R11.4). Red used to be the "done" colour, so a finished run looked failed.
export function Stepper({ currentIndex, end }: { currentIndex: number; end?: StepperEnd }) {
  const colors = barColors(currentIndex, STEPPER_STEPS.length, end);
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${Math.min(currentIndex + 1, STEPPER_STEPS.length)} of ${STEPPER_STEPS.length}: ${STEPPER_STEPS[Math.min(currentIndex, STEPPER_STEPS.length - 1)]}`}>
      {STEPPER_STEPS.map((label, i) => (
        <View key={label} style={styles.step}>
          <View style={[styles.bar, { backgroundColor: colors[i] }]} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  step: { flex: 1, alignItems: 'center', gap: space.xs },
  bar: { width: '100%', height: 4, borderRadius: 2 },
  label: { fontFamily: font.bold, fontSize: 10, color: color.muted, textAlign: 'center' },
});

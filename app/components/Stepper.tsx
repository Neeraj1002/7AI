import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font, space } from '../lib/theme';
import { STEPPER_STEPS } from '../lib/run-labels';

// `ended` (U5): the run is over, so no step is in progress - the stop point shows a final marker, not an active ring.
export function Stepper({ currentIndex, attention, ended }: { currentIndex: number; attention?: boolean; ended?: boolean }) {
  return (
    <View style={styles.row}>
      {STEPPER_STEPS.map((label, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? (ended ? 'stopped' : 'current') : 'future';
        const isFailedStep = state === 'current' && attention;
        return (
          <View key={label} style={styles.step}>
            <View
              style={[
                styles.dot,
                state === 'done' && styles.dotDone,
                state === 'current' && styles.dotCurrent,
                isFailedStep && styles.dotAttention,
                state === 'future' && styles.dotFuture,
                state === 'stopped' && styles.dotStopped,
              ]}
            >
              {state === 'done' ? <Feather name="check" size={12} color={color.onAccent} /> : null}
              {state === 'stopped' ? <Feather name="x" size={12} color={color.danger} /> : null}
              {isFailedStep ? <Feather name="alert-triangle" size={11} color={color.warnText} /> : null}
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT_SIZE = 22;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', gap: space.xs, flex: 1 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: color.accent },
  dotCurrent: { backgroundColor: color.accentSoft, borderWidth: 3, borderColor: color.accent },
  dotAttention: { backgroundColor: color.warnBg, borderColor: color.warnText },
  dotStopped: { backgroundColor: color.bg, borderWidth: 2, borderColor: color.danger },
  dotFuture: { backgroundColor: color.bg, borderWidth: 2, borderColor: color.future },
  label: { fontFamily: font.regular, fontSize: 10, color: color.muted, textAlign: 'center' },
});

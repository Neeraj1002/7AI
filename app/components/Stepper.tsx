import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font, space } from '../lib/theme';
import { STEPPER_STEPS } from '../lib/run-labels';

export function Stepper({ currentIndex }: { currentIndex: number }) {
  return (
    <View style={styles.row}>
      {STEPPER_STEPS.map((label, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future';
        return (
          <View key={label} style={styles.step}>
            <View
              style={[
                styles.dot,
                state === 'done' && styles.dotDone,
                state === 'current' && styles.dotCurrent,
                state === 'future' && styles.dotFuture,
              ]}
            >
              {state === 'done' ? <Feather name="check" size={12} color={color.onAccent} /> : null}
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
  dotFuture: { backgroundColor: color.bg, borderWidth: 2, borderColor: color.future },
  label: { fontFamily: font.regular, fontSize: 10, color: color.muted, textAlign: 'center' },
});

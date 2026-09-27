import React from 'react';
import { Text, Pressable, View, StyleSheet } from 'react-native';
import { color, font, radius } from '../lib/theme';

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabledValues,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Options that render dimmed and can't be tapped (e.g. Gate 2 off restricts visibility to Private). */
  disabledValues?: readonly T[];
}) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.value === value;
        const disabled = disabledValues?.includes(o.value) ?? false;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => !disabled && onChange(o.value)}
            disabled={disabled}
            style={[styles.item, active && styles.itemActive, disabled && styles.itemDisabled]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
          >
            <Text
              style={[styles.text, active && { color: color.ink }, disabled && styles.textDisabled]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: radius.md, padding: 3 },
  item: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  itemActive: { backgroundColor: color.bg },
  itemDisabled: { opacity: 0.4 },
  text: { fontFamily: font.semibold, fontSize: 13, color: color.muted },
  textDisabled: { color: color.muted },
});

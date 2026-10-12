import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font, radius } from '../lib/theme';

// A 48 px select-style field (value + chevron) that opens an OptionSheet. Disabled looks grey, like the Length field
// on the "Video with a format" board.
export function DropdownField({
  value,
  onPress,
  disabled,
  invalid,
  accessibilityLabel,
  style,
}: {
  value: string;
  onPress: () => void;
  disabled?: boolean;
  invalid?: boolean;
  accessibilityLabel: string;
  style?: React.ComponentProps<typeof View>['style'];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${value}`}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.field, invalid && styles.invalid, disabled && styles.disabled, style]}
    >
      <Text style={[styles.text, disabled && styles.textDisabled]} numberOfLines={1}>
        {value}
      </Text>
      <Feather name="chevron-down" size={18} color={disabled ? color.muted : color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.surface,
  },
  invalid: { borderWidth: 2, borderColor: color.danger },
  disabled: { borderColor: color.border, backgroundColor: color.surface2 },
  text: { flexShrink: 1, fontFamily: font.bold, fontSize: 15, color: color.ink },
  textDisabled: { color: color.muted },
});

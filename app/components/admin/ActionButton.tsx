import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, radius, space, type } from '../../lib/theme';

// Outlined button with an accessibility role and label; the shared SecondaryButton has
// neither, and it is not part of this task to change it.
export function ActionButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[styles.button, (disabled || loading) && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={color.ink} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={color.ink} /> : null}
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
    backgroundColor: color.surface,
  },
  disabled: { opacity: 0.5 },
  label: { ...type.button, fontSize: 15, color: color.ink },
});

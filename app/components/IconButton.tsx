import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { color } from '../lib/theme';

type FeatherName = keyof typeof Feather.glyphMap;

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = 'feather',
  iconColor = color.muted,
  backgroundColor = color.surface2,
}: {
  name: FeatherName | keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** Feather has no bug glyph — bug-report is the one exception using MaterialCommunityIcons. */
  variant?: 'feather' | 'community';
  iconColor?: string;
  backgroundColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, { backgroundColor }]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {variant === 'community' ? (
        <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color={iconColor} />
      ) : (
        <Feather name={name as FeatherName} size={20} color={iconColor} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
}: {
  name: FeatherName | keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** Feather has no bug glyph — bug-report is the one exception using MaterialCommunityIcons. */
  variant?: 'feather' | 'community';
}) {
  return (
    <Pressable onPress={onPress} style={styles.button} hitSlop={8} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {variant === 'community' ? (
        <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color={color.muted} />
      ) : (
        <Feather name={name as FeatherName} size={20} color={color.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

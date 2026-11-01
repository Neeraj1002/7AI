import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, radius, space, type } from '../lib/theme';

type IconName = keyof typeof Feather.glyphMap;

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  /** PrimaryButton only: shown beside the spinner while loading (otherwise the spinner stands alone). */
  loadingLabel?: string;
};

// height 54, radius 14, centered [icon][label] row with flexShrink+numberOfLines
// on the label — the fix for the Gate 2 "arrow stuck to the left" bug the
// founder caught (a long label pushed the row's flex-start icon away from it).
export function PrimaryButton({ label, onPress, icon, disabled, loading, style, labelStyle, loadingLabel }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.primary, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={color.onAccent} />
          {loadingLabel ? <Text style={[styles.primaryLabel, labelStyle]}>{loadingLabel}</Text> : null}
        </>
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={color.onAccent} /> : null}
          <Text style={[styles.primaryLabel, labelStyle]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.secondary, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={color.ink} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={16} color={color.ink} /> : null}
          <Text style={styles.secondaryLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function DangerTextButton({ label, onPress, icon, disabled, style }: Omit<ButtonProps, 'loading'>) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.dangerText, disabled && styles.disabled, style]}>
      {icon ? <Feather name={icon} size={16} color={color.danger} /> : null}
      <Text style={styles.dangerLabel}>{label}</Text>
    </Pressable>
  );
}

// Bordered, not filled — for a destructive action that sits alongside a
// primary button (Retry / Cancel, Run again / Cancel while running) rather
// than replacing it.
export function DangerOutlineButton({ label, onPress, icon, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.dangerOutline, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={color.danger} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={16} color={color.danger} /> : null}
          <Text style={styles.dangerLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const rowBase = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: space.sm,
  borderRadius: radius.lg,
};

const styles = StyleSheet.create({
  primary: { ...rowBase, height: 54, backgroundColor: color.accent, paddingHorizontal: space.lg },
  primaryLabel: { ...type.button, color: color.onAccent, flexShrink: 1 },
  secondary: {
    ...rowBase,
    height: 46,
    backgroundColor: color.surface2,
    paddingHorizontal: space.lg,
  },
  secondaryLabel: { ...type.bodyStrong, color: color.ink, flexShrink: 1 },
  dangerText: { ...rowBase, height: 46, paddingHorizontal: space.md },
  dangerOutline: {
    ...rowBase,
    height: 46,
    paddingHorizontal: space.lg,
    borderWidth: 1.5,
    borderColor: color.dangerBorder,
  },
  dangerLabel: { ...type.bodyStrong, color: color.danger, flexShrink: 1 },
  disabled: { opacity: 0.5 },
});

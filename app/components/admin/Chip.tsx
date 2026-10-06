import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../../lib/theme';

export type ChipTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

const TONE: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: color.surface2, fg: color.ink },
  ok: { bg: color.okBg, fg: color.okText },
  warn: { bg: color.warnBg, fg: color.warnText },
  danger: { bg: color.failBg, fg: color.failText },
  accent: { bg: color.accentSoft, fg: color.accentText },
};

// Without onPress: a read-only status chip (status is always carried by its text, never
// by colour alone). With onPress: a selectable chip with a 44pt touch target.
export function Chip({
  label,
  tone = 'neutral',
  selected,
  onPress,
  pending,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  onPress?: () => void;
  pending?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const t = TONE[tone];
  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: t.bg }]} accessibilityLabel={accessibilityLabel ?? label}>
        <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!(disabled || pending), busy: !!pending }}
      style={styles.hit}
    >
      <View
        style={[
          styles.chip,
          selected ? styles.selected : { backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.border },
          disabled && styles.disabled,
        ]}
      >
        {pending ? <ActivityIndicator size="small" color={selected ? color.onAccent : color.ink} /> : null}
        <Text style={[styles.text, { color: selected ? color.onAccent : color.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  selected: { backgroundColor: color.ink },
  disabled: { opacity: 0.5 },
  text: { ...type.chip },
});

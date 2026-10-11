import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, radius, space, type } from '../lib/theme';

export type StatusChipKind = 'waiting' | 'attention' | 'failed' | 'error' | 'ok' | 'neutral';

const KIND_STYLE: Record<StatusChipKind, { bg: string; fg: string }> = {
  waiting: { bg: color.accentSoft, fg: color.accentText },
  attention: { bg: color.warnBg, fg: color.warnText },
  failed: { bg: color.failBg, fg: color.failText },
  // Red-on-pink "Failed" word used on the Run, Queue and Inbox boards (NEXT 1).
  error: { bg: color.accentSoft, fg: color.accentText },
  ok: { bg: color.okBg, fg: color.okText },
  neutral: { bg: color.surface2, fg: color.ink },
};

export function StatusChip({
  kind,
  label,
  icon,
}: {
  kind: StatusChipKind;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const { bg, fg } = KIND_STYLE[kind];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Feather name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  text: { ...type.chip },
});

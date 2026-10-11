import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, radius, space, type } from '../../lib/theme';

export type BannerKind = 'info' | 'warning' | 'error';

const KIND: Record<BannerKind, { bg: string; fg: string; icon: keyof typeof Feather.glyphMap; word: string }> = {
  info: { bg: color.surface2, fg: color.ink, icon: 'info', word: 'Note' },
  warning: { bg: color.warnBg, fg: color.warnText, icon: 'alert-triangle', word: 'Warning' },
  error: { bg: color.accentSoft, fg: color.accentText, icon: 'alert-circle', word: 'Error' },
};

export function Banner({ kind, children }: { kind: BannerKind; children: React.ReactNode }) {
  const k = KIND[kind];
  return (
    <View style={[styles.banner, { backgroundColor: k.bg }]} accessibilityRole="alert">
      <Feather name={k.icon} size={16} color={k.fg} style={styles.icon} accessibilityLabel={k.word} />
      <Text style={[styles.text, { color: k.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  icon: { marginTop: 2 },
  text: { ...type.body, flex: 1, fontSize: 14, lineHeight: 20 },
});

import React from 'react';
import { Text, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Feather } from '@expo/vector-icons';
import { color, font, space, type } from '../lib/theme';
import { formatLengthLabel } from '../lib/formats';

export type FormatOption = { key: string; label: string; targetSeconds: number };

// Board N_S4FormatSheet: Freeform first (default), then only this channel's formats (`channels.listFormats` with its
// channelId) with their length as a pill; a ✓ marks the selected row. The footer link to Content profile is only
// passed for users who can edit the profile.
export function FormatSheet({
  visible,
  onClose,
  formats,
  selected,
  onSelect,
  onEditProfile,
}: {
  visible: boolean;
  onClose: () => void;
  formats: FormatOption[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Present only when the user may edit the channel's profile. */
  onEditProfile?: () => void;
}) {
  const pick = (key: string | null) => {
    onSelect(key);
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>Pick a format</Text>
        <Text style={styles.sub}>Formats this channel uses. Sets the structure and length; you can still edit the brief.</Text>
      </View>
      <ScrollView style={styles.list}>
        <Pressable
          style={[styles.row, selected === null && styles.rowActive]}
          onPress={() => pick(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === null }}
        >
          <Text style={[styles.label, styles.labelBold]}>Freeform</Text>
          <Text style={styles.sub}>default</Text>
          {selected === null ? <Feather name="check" size={18} color={color.accent} /> : null}
        </Pressable>
        {formats.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.row, styles.rowBorder, selected === f.key && styles.rowActive]}
            onPress={() => pick(f.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === f.key }}
          >
            <Text style={[styles.label, selected === f.key && styles.labelBold]}>{f.label}</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatLengthLabel(f.targetSeconds)}</Text>
            </View>
            {selected === f.key ? <Feather name="check" size={18} color={color.accent} /> : null}
          </Pressable>
        ))}
        {onEditProfile ? (
          <Pressable
            style={[styles.row, styles.rowBorder, styles.linkRow]}
            onPress={() => {
              onClose();
              onEditProfile();
            }}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Edit this channel&apos;s formats in Content profile ›</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  title: { fontFamily: font.black, fontSize: 20, color: color.ink },
  sub: { ...type.meta },
  list: { maxHeight: 460 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46, paddingHorizontal: space.xs },
  rowBorder: { borderTopWidth: 1, borderTopColor: color.border },
  rowActive: { backgroundColor: color.accentSoft },
  label: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: color.ink },
  labelBold: { fontFamily: font.black },
  linkRow: { minHeight: 52 },
  link: { fontFamily: font.black, fontSize: 14, color: color.accent },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color.surface2 },
  pillText: { fontFamily: font.bold, fontSize: 12, color: color.ink },
});

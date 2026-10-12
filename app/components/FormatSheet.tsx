import React from 'react';
import { Text, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { color, font, space, type } from '../lib/theme';

export type FormatOption = { key: string; label: string; targetSeconds: number };

// Board "Format picker sheet": Freeform first (tinted when selected, "default" on the right), then every
// format from `channels.listFormats` with its target length as a pill.
export function FormatSheet({
  visible,
  onClose,
  formats,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  formats: FormatOption[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const pick = (key: string | null) => {
    onSelect(key);
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>Pick a format</Text>
        <Text style={styles.sub}>Sets the structure and target length. You can still edit the brief.</Text>
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
              <Text style={styles.pillText}>{f.targetSeconds}s</Text>
            </View>
          </Pressable>
        ))}
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
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color.surface2 },
  pillText: { fontFamily: font.bold, fontSize: 12, color: color.ink },
});

import React from 'react';
import { Text, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { color, font, radius, space, type } from '../lib/theme';

export type Option<T extends string> = { value: T | null; label: string; caption?: string };

// Radio list in a bottom sheet; picking a row applies immediately and closes.
export function OptionSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly Option<T>[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <Pressable
              key={o.value ?? 'default'}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                onSelect(o.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.text}>
                <Text style={styles.label}>{o.label}</Text>
                {o.caption ? <Text style={styles.caption}>{o.caption}</Text> : null}
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <Feather name="check" size={14} color={color.onAccent} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...type.stackTitle, color: color.ink },
  list: { maxHeight: 460 },
  listContent: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  rowActive: { backgroundColor: color.accentSoft },
  text: { flex: 1 },
  label: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  caption: { ...type.meta, fontSize: 12 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { backgroundColor: color.accent, borderColor: color.accent },
});

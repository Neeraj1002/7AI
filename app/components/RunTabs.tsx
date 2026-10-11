import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { color, font, radius } from '../lib/theme';

export type RunTab = 'brief' | 'script' | 'video';
const TABS: { value: RunTab; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'script', label: 'Script' },
  { value: 'video', label: 'Video' },
];

// Brief / Script / Video on one line (NEXT 1 Run board). Labels never wrap, so the row stays on one line at any
// font scale; each tab is at least 44 px tall.
export function RunTabs({ value, onChange }: { value: RunTab; onChange: (tab: RunTab) => void }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            style={[styles.item, active && styles.itemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg, backgroundColor: color.surface2 },
  item: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: color.ink },
  text: { fontFamily: font.black, fontSize: 14, color: color.ink },
  textActive: { color: color.onAccent },
});

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color } from '../lib/theme';

// A horizontally scrolling row of filter chips (Sprint 5 Task 7 R10).
// - `flexGrow: 0`: React Native gives every ScrollView `flexGrow: 1`, and inside a screen whose content container also
//   grows, a short list left free height that these rows swallowed, which dropped the banner and the list header to the
//   bottom half of the Queue.
// - A fade on the right edge shows that more chips are off screen, so a name is never just cut off.
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', color.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, flexShrink: 0 },
  scroll: { flexGrow: 0 },
  content: { gap: 8, paddingVertical: 6, paddingRight: 28 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 28 },
});

import React from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space } from '../lib/theme';

// Absolutely positioned inside a FormScreen's keyboard-avoiding view so it
// rises with the keyboard. Screens using it add `paddingBottom` to their
// scroll content (via onHeight) so the last item is never hidden under it.
export function BottomActionBar({
  children,
  onHeight,
}: {
  children: React.ReactNode;
  onHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const onLayout = (e: LayoutChangeEvent) => onHeight?.(e.nativeEvent.layout.height);
  return (
    <View onLayout={onLayout} style={[styles.bar, { paddingBottom: space.xl + insets.bottom }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
});

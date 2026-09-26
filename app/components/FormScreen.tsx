import React from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Screen } from './Screen';

// Every screen with a TextInput uses this instead of Screen directly (E8).
// `behavior="padding"` on both platforms — the pre-Enhancement-1 pattern
// (`Platform.OS === 'ios' ? 'padding' : undefined`) was a no-op on Android,
// where edge-to-edge means the window never resizes for the keyboard on its
// own. `keyboardVerticalOffset` is 0: this view sits below Screen's own
// header, so its measured position already accounts for that height.
export function FormScreen({
  title,
  subtitle,
  variant,
  right,
  children,
  footer,
  contentContainerStyle,
}: {
  title: string;
  subtitle?: string;
  variant: 'tabRoot' | 'stack';
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Rendered inside the keyboard-avoiding view, e.g. a BottomActionBar, so it rises with the keyboard. */
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Screen title={title} subtitle={subtitle} variant={variant} right={right}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
});

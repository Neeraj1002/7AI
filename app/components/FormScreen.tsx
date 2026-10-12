import React from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from './Screen';
import { color } from '../lib/theme';

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
  onBack,
  children,
  footer,
  contentContainerStyle,
  refreshControl,
  scrollRef,
}: {
  title: string;
  subtitle?: string;
  variant: 'tabRoot' | 'stack';
  right?: React.ReactNode;
  onBack?: () => void;
  children: React.ReactNode;
  /** Rendered inside the keyboard-avoiding view, e.g. a BottomActionBar, so it rises with the keyboard. */
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh for the scroll area (tab screens with a search field). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** For screens that scroll to a field themselves (e.g. Content profile revealing an error). */
  scrollRef?: React.Ref<ScrollView>;
}) {
  return (
    <Screen title={title} subtitle={subtitle} variant={variant} right={right} onBack={onBack}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={refreshControl}
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

// Header-less variant for full-page forms outside the (app) shell (Sign in).
export function FormScreenPlain({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: color.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { color, space, type } from '../lib/theme';
import { ReportBugButton } from './ReportBugButton';

// Replaces the native Stack header everywhere inside (app) — headerShown is
// set to false on every screen in that group, and every screen renders its
// own header via this component instead, matching the canvas's two header
// shapes (tab-root vs. pushed stack screen).
export function Screen({
  title,
  subtitle,
  variant,
  right,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  variant: 'tabRoot' | 'stack';
  right?: React.ReactNode;
  /** Overrides the back chevron (e.g. to guard unsaved changes). */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {variant === 'stack' ? (
            <Pressable
              onPress={onBack ?? (() => router.back())}
              style={styles.backButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="chevron-left" size={26} color={color.ink} />
            </Pressable>
          ) : null}
          <View style={styles.titleBlock}>
            <Text style={variant === 'tabRoot' ? styles.screenTitle : styles.stackTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          {right}
          <ReportBugButton />
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: space.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  titleBlock: { flexShrink: 1 },
  screenTitle: { ...type.screenTitle, color: color.ink },
  stackTitle: { ...type.stackTitle, color: color.ink },
  subtitle: { ...type.meta, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

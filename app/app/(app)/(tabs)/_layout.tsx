import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
// expo-router SDK 57 vendors its own bottom-tabs navigator (no dependency on
// the real @react-navigation/bottom-tabs package) — this is the only place
// its BottomTabBarProps type is actually exported from.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { color, font, radius, space } from '../../../lib/theme';

const TAB_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  index: 'list',
  notifications: 'bell',
  dashboard: 'bar-chart-2',
  channels: 'tv',
};
const TAB_LABEL: Record<string, string> = {
  index: 'Queue',
  notifications: 'Inbox',
  dashboard: 'Dashboard',
  channels: 'Channels',
};

function useQueueBadgeCount(): number {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.runs.list.queryOptions({ statuses: ['paused_gate1', 'paused_gate2'] }),
  );
  return data?.length ?? 0;
}

function useInboxBadgeCount(): number {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.notifications.list.queryOptions());
  return data?.filter((n) => !n.resolvedAt).length ?? 0;
}

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const queueBadge = useQueueBadgeCount();
  const inboxBadge = useInboxBadgeCount();

  return (
    <View style={[styles.bar, { height: 76 + insets.bottom, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const badge = route.name === 'index' ? queueBadge : route.name === 'notifications' ? inboxBadge : 0;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={descriptors[route.key].options.title ?? TAB_LABEL[route.name]}
          >
            <View style={styles.iconWrap}>
              <View style={[styles.pill, isFocused && styles.pillActive]}>
                <Feather
                  name={TAB_ICON[route.name]}
                  size={20}
                  color={isFocused ? color.accentText : color.muted}
                />
              </View>
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
              {TAB_LABEL[route.name]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// The route-group folder (tabs) is invisible in URLs — expo-router does not
// include route-group segment names in the path, so /run/<id> deep links and
// ReportBugButton's pathname regex are unaffected by this restructuring.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Queue' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="channels" options={{ title: 'Channels' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    width: 60,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: color.accentSoft },
  label: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  labelActive: { fontFamily: font.bold, color: color.accentText },
  badge: {
    position: 'absolute',
    top: -4,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.bold, fontSize: 10, color: color.onAccent },
});

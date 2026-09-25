import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ChannelProvider } from '../../lib/channel-context';
import { ChannelSwitcher } from '../../components/ChannelSwitcher';
import { ReportBugButton } from '../../components/ReportBugButton';

// The bug-report icon belongs on every screen inside this authenticated
// shell (it needs no per-screen data — it derives run/screen context from
// the router itself at tap time), not folded into ChannelSwitcher: each
// Stack.Screen below already sets its own headerRight individually (there's
// no single shared screenOptions.headerRight here to hook once), so this
// combines both in one place rather than duplicating <ReportBugButton />
// six times.
function HeaderRight({ withChannelSwitcher }: { withChannelSwitcher?: boolean }) {
  return (
    <View style={styles.headerRight}>
      <ReportBugButton />
      {withChannelSwitcher && <ChannelSwitcher />}
    </View>
  );
}

// Deliberately not present on login/verify — there's no signed-in context to
// report from there (this whole group redirects to /login before rendering
// otherwise), a known, accepted scope limit given the project's ~10-tester
// scale, not an oversight.
export default function AppGroupLayout() {
  const { isLoading, token } = useAuth();

  if (isLoading) return null;
  if (!token) return <Redirect href="/login" />;

  return (
    <ChannelProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ title: 'Queue', headerRight: () => <HeaderRight withChannelSwitcher /> }}
        />
        <Stack.Screen
          name="new-brief"
          options={{ title: 'New Brief', headerRight: () => <HeaderRight withChannelSwitcher /> }}
        />
        <Stack.Screen name="run/[id]" options={{ title: 'Run', headerRight: () => <HeaderRight /> }} />
        <Stack.Screen
          name="dashboard"
          options={{ title: 'Dashboard', headerRight: () => <HeaderRight withChannelSwitcher /> }}
        />
        <Stack.Screen name="channels" options={{ title: 'Channels', headerRight: () => <HeaderRight /> }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications', headerRight: () => <HeaderRight /> }} />
      </Stack>
    </ChannelProvider>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

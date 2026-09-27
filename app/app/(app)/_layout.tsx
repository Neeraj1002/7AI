import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ChannelProvider } from '../../lib/channel-context';

// UI Enhancement 1 (E1): every screen inside this group renders its own
// header via the Screen/FormScreen component instead of a native Stack
// header — headerShown is false on every route below. The bug-report icon
// moved into Screen itself (it's already on every screen there), so there's
// no more per-route headerRight to wire up here.
//
// Deliberately not present on login/verify — there's no signed-in context to
// report from there (this whole group redirects to /login before rendering
// otherwise), a known, accepted scope limit given the project's ~10-tester
// scale, not an oversight.
export default function AppGroupLayout() {
  const { isLoading, token, serverStatus } = useAuth();

  if (isLoading) return null;
  if (!token) return <Redirect href="/login" />;
  // Bugs Task 8 (R2) — see lib/auth.tsx serverStatus.
  if (serverStatus === 'down') return <Redirect href="/server-down" />;

  return (
    <ChannelProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="run/[id]" />
        <Stack.Screen name="new-brief" />
        <Stack.Screen name="channel/[id]" />
      </Stack>
    </ChannelProvider>
  );
}

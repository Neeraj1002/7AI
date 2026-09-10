import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ChannelProvider } from '../../lib/channel-context';
import { ChannelSwitcher } from '../../components/ChannelSwitcher';

export default function AppGroupLayout() {
  const { isLoading, token } = useAuth();

  if (isLoading) return null;
  if (!token) return <Redirect href="/login" />;

  return (
    <ChannelProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ title: 'Queue', headerRight: () => <ChannelSwitcher /> }}
        />
        <Stack.Screen
          name="new-brief"
          options={{ title: 'New Brief', headerRight: () => <ChannelSwitcher /> }}
        />
        <Stack.Screen name="run/[id]" options={{ title: 'Run' }} />
        <Stack.Screen
          name="dashboard"
          options={{ title: 'Dashboard', headerRight: () => <ChannelSwitcher /> }}
        />
      </Stack>
    </ChannelProvider>
  );
}

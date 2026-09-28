import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts, Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { TRPCProvider, createTrpcClient, isServerUnreachableError } from '../lib/trpc';

// Sprint 3 Task 3 (FE11') — tapping a real push notification deep-links
// straight into the relevant screen, reusing the exact payload shape
// backend Task 7/O1's ExpoPushChannel sends (`data: { kind, runId? }`) —
// Run Detail for an approval_request (a runId is always present there),
// the Notifications screen otherwise (a bare "notify" ping, or one with no
// runId at all). No native push support on web (same reasoning as
// lib/push.ts) — this listener is simply inert there, not an error.
function usePushNotificationTapHandler(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string; runId?: string };
      if (data.runId) {
        router.push(`/run/${data.runId}`);
      } else {
        router.push('/notifications');
      }
    });
    return () => subscription.remove();
  }, []);
}

function Providers({ children }: { children: React.ReactNode }) {
  const { token, apiUrl, reportServerUnreachable } = useAuth();

  // Recreated whenever the stored credentials change (e.g. right after
  // signing in) — a stale client would otherwise keep using an old token.
  // Placeholder values before sign-in are harmless: the login screen doesn't
  // issue any tRPC calls, and every other route is gated on `token` being
  // set (app/(app)/_layout.tsx).
  // Bugs Task 8 (R2) — a network-level failure (see isServerUnreachableError)
  // flips the app to the server-down screen, and isn't retried 3x first
  // (react-query's default), which is what kept the old spinner going.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (isServerUnreachableError(error)) reportServerUnreachable();
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (isServerUnreachableError(error)) reportServerUnreachable();
          },
        }),
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => !isServerUnreachableError(error) && failureCount < 3,
          },
        },
      }),
    [reportServerUnreachable],
  );
  const trpcClient = useMemo(
    () => createTrpcClient(apiUrl ?? 'http://localhost:4000', token ?? ''),
    [apiUrl, token],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  usePushNotificationTapHandler();
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="verify" options={{ title: 'Signing in…' }} />
        <Stack.Screen name="server-down" options={{ title: 'Server unavailable' }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // R1 (device review, 2026-09-28): rendering before Archivo resolves measured
  // labels in the system font and then drew them in wider Archivo, clipping
  // single-line text ("Serve", "Chang", "Inb…") on some cold starts. Block on
  // fontsLoaded (or fontError, so a real font-load failure doesn't hang the
  // app forever) instead.
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <Providers>
        <RootNavigator />
      </Providers>
    </AuthProvider>
  );
}

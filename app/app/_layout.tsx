import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../lib/auth';
import { TRPCProvider, createTrpcClient } from '../lib/trpc';

function Providers({ children }: { children: React.ReactNode }) {
  const { token, apiUrl } = useAuth();

  // Recreated whenever the stored credentials change (e.g. right after
  // signing in) — a stale client would otherwise keep using an old token.
  // Placeholder values before sign-in are harmless: the login screen doesn't
  // issue any tRPC calls, and every other route is gated on `token` being
  // set (app/(app)/_layout.tsx).
  const queryClient = useMemo(() => new QueryClient(), []);
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <Providers>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="login" options={{ title: 'Sign in' }} />
          <Stack.Screen name="verify" options={{ title: 'Signing in…' }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </Providers>
    </AuthProvider>
  );
}

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { verifyMagicLinkToken } from '../lib/auth-api';

// Sprint 3 Task 1 (FE7) — the deep-link half of magic-link sign-in.
// `app.json`'s existing `scheme: "sevenai"` means Expo Router maps
// `sevenai://verify?token=...` to this exact route file, with `token`
// available via useLocalSearchParams — the same convergence point the
// manual-paste fallback (login.tsx) reaches via a direct call to the same
// verifyMagicLinkToken function. Real caveat, stated plainly rather than
// glossed over: the backend's own console-logged link is a plain HTTP URL
// to the API server itself (`${apiUrl}/auth/verify?token=...`), not an
// app-scheme URL — tapping it today opens a browser tab hitting the API
// directly, not this screen. This route exists and is real (a `sevenai://`
// link built with the same token does land here and completes sign-in), but
// there is currently no backend-generated link that would actually reach it
// via a real tap outside of manually constructing one for testing.
export default function VerifyScreen() {
  const { apiUrl, isLoading: authLoading, setApiUrl, completeSignIn } = useAuth();
  const { token, apiUrl: apiUrlParam } = useLocalSearchParams<{ token?: string; apiUrl?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');

  useEffect(() => {
    if (authLoading) return;
    void (async () => {
      const effectiveApiUrl = apiUrlParam ?? apiUrl;
      if (!token || !effectiveApiUrl) {
        setStatus('error');
        setError(!token ? 'This link is missing a token.' : 'No API URL is known — sign in manually first.');
        return;
      }
      try {
        if (apiUrlParam) await setApiUrl(apiUrlParam);
        const result = await verifyMagicLinkToken(effectiveApiUrl, token);
        await completeSignIn(result);
        router.replace('/');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    })();
    // Deliberately runs once per mount with the params/authLoading it had —
    // re-verifying with a single-use token on a dependency change would fail
    // the second time even on the exact same, otherwise-successful link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Sign-in failed</Text>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={styles.status}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  status: { fontSize: 14, color: '#666' },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  error: { color: '#c00', fontSize: 14, textAlign: 'center' },
  button: { marginTop: 12, backgroundColor: '#111', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontWeight: '600' },
});

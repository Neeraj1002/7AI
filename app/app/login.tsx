import React, { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { requestMagicLink, verifyMagicLinkToken, extractToken } from '../lib/auth-api';

// Sprint 3 Task 1 (FE6/FE7): real magic-link sign-in, replacing the old
// "paste the shared API_AUTH_TOKEN" screen. No real transactional-email
// provider exists yet (Sprint 3 backend Task 1's own stated scope) — the
// real link is logged to the server console and, if the account has a
// linked Telegram, relayed there too. The manual-paste fallback below is a
// direct accommodation of that gap, not a permanent design — remove once
// real email delivery exists.
export default function LoginScreen() {
  const { isLoading: authLoading } = useAuth();
  // Waits for AuthProvider's own SecureStore read before mounting the form —
  // lets LoginForm's local `apiUrl` state initialize lazily from the real
  // stored value on its very first render, rather than syncing it in from an
  // effect after the fact (which React's own lint rules flag as the wrong
  // pattern for "derive initial state from an external source").
  if (authLoading) return null;
  return <LoginForm />;
}

function LoginForm() {
  const { apiUrl: storedApiUrl, setApiUrl, completeSignIn } = useAuth();
  const [apiUrl, setApiUrlField] = useState(storedApiUrl ?? 'http://localhost:4000');
  const [email, setEmail] = useState('');
  const [pasted, setPasted] = useState('');
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleRequestLink = async () => {
    setError(null);
    setRequestMessage(null);
    if (!apiUrl.trim() || !email.trim()) {
      setError('API URL and email are both required.');
      return;
    }
    setIsRequesting(true);
    try {
      await setApiUrl(apiUrl.trim());
      const { message } = await requestMagicLink(apiUrl.trim(), email.trim());
      // Same neutral message regardless of whether the email was recognized
      // — Sprint 3 backend Task 1's own no-enumeration design; this screen
      // must not show a different message for either case.
      setRequestMessage(message || 'If that email has an account, a login link was sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request a link.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    if (!apiUrl.trim() || !pasted.trim()) {
      setError('API URL and a pasted link/token are both required.');
      return;
    }
    setIsVerifying(true);
    try {
      await setApiUrl(apiUrl.trim());
      const token = extractToken(pasted);
      const result = await verifyMagicLinkToken(apiUrl.trim(), token);
      await completeSignIn(result, apiUrl.trim());
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>7AI Studio</Text>
        <Text style={styles.subtitle}>Sign in with a magic link sent to your email.</Text>

        <Text style={styles.label}>API base URL</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrlField}
          placeholder="http://192.168.1.10:4000"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Pressable style={[styles.button, isRequesting && styles.buttonDisabled]} onPress={handleRequestLink} disabled={isRequesting}>
          {isRequesting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request link</Text>}
        </Pressable>

        {requestMessage ? <Text style={styles.info}>{requestMessage}</Text> : null}

        <Text style={styles.sectionDivider}>— or —</Text>

        <Text style={styles.label}>Paste your sign-in link or token</Text>
        <Text style={styles.hint}>
          No email delivery is wired up yet — copy the link from the server console (or your linked
          Telegram) and paste it here.
        </Text>
        <TextInput
          style={styles.input}
          value={pasted}
          onChangeText={setPasted}
          placeholder="http://.../auth/verify?token=... or the raw token"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable style={[styles.button, isVerifying && styles.buttonDisabled]} onPress={handleVerify} disabled={isVerifying}>
          {isVerifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & sign in</Text>}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 12, color: '#888', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  info: { color: '#1a7f37', marginTop: 12, fontSize: 13 },
  error: { color: '#c00', marginTop: 12 },
  sectionDivider: { textAlign: 'center', color: '#999', marginVertical: 20, fontSize: 13 },
  button: {
    marginTop: 16,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

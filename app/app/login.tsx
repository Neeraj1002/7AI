import React, { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';

// Task 2's "lock on the door" screen — just the token and the API's base
// URL, entered once and held in SecureStore (lib/storage.ts). Not a real
// login: there's no username, no session, nothing to validate here beyond
// "these two fields are non-empty" — the API itself is what actually
// rejects a bad token, on the very first real request.
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [apiUrl, setApiUrl] = useState('http://localhost:4000');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!apiUrl.trim() || !token.trim()) {
      setError('Both fields are required.');
      return;
    }
    setError(null);
    await signIn(token.trim(), apiUrl.trim());
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>7AI Studio</Text>
      <Text style={styles.subtitle}>Enter the API URL and auth token to connect.</Text>

      <Text style={styles.label}>API base URL</Text>
      <TextInput
        style={styles.input}
        value={apiUrl}
        onChangeText={setApiUrl}
        placeholder="http://192.168.1.10:4000"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>API auth token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="paste API_AUTH_TOKEN"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Connect</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: '#c00', marginTop: 12 },
  button: {
    marginTop: 24,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

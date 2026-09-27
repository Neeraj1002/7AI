import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { router, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { requestMagicLink, verifyMagicLinkToken, extractToken } from '../lib/auth-api';
import { getSecureItem, setSecureItem } from '../lib/storage';
import { EMAIL_KEY } from '../lib/session-keys';
import { color, font, radius, space, type } from '../lib/theme';
import { FormScreenPlain } from '../components/FormScreen';
import { PrimaryButton } from '../components/Buttons';

// Per-device convenience only (never used for account lookup): pre-fills this
// device's last-used Telegram Chat ID (Bugs Task 3/R5).
const TELEGRAM_CHAT_ID_KEY = 'sevenai.telegramChatId';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOT_NAME = process.env.EXPO_PUBLIC_TELEGRAM_BOT_NAME || 'the 7AI Telegram bot';
// Sprint 3 Task 10 (R2) — two named presets above the existing free-text
// field, which still covers "Custom" (a Tailscale Funnel URL, Bugs Task 5,
// or anything else). LOCAL_API_URL is overridable per-founder via a build-time
// env var (same EXPO_PUBLIC_* pattern as BOT_NAME above) once a real LAN IP
// is known — it can't be a hardcoded universal constant the way PREVIEW_API_URL
// is, since a LAN IP is machine/network-specific. PREVIEW_API_URL is the real,
// fixed deployed server (docs/server/deployment/preview/detail.md).
const LOCAL_API_URL = process.env.EXPO_PUBLIC_LOCAL_API_URL || 'http://localhost:4000';
const PREVIEW_API_URL = 'https://7aistudio.tech';

// Waits for AuthProvider's SecureStore read so LoginForm's local apiUrl state
// can initialize lazily from the real stored value.
export default function LoginScreen() {
  const { isLoading: authLoading, token } = useAuth();
  // Waits for AuthProvider's own SecureStore read before mounting the form —
  // lets LoginForm's local `apiUrl` state initialize lazily from the real
  // stored value on its very first render, rather than syncing it in from an
  // effect after the fact (which React's own lint rules flag as the wrong
  // pattern for "derive initial state from an external source").
  if (authLoading) return null;
  // Bugs Task 4 (R2) — the mirror image of (app)/_layout.tsx's own
  // `if (!token) return <Redirect href="/login" />`. Without this, any
  // accidental navigation to /login while a session is already intact (e.g.
  // R1's bug-report fallback route popping back here) renders the login form
  // over a perfectly valid session, making it look logged-out — confirmed
  // live: force-quitting and reopening showed the session was never actually
  // lost. Self-corrects regardless of what causes the navigation.
  if (token) return <Redirect href="/" />;
  return <LoginForm />;
}

function LoginForm() {
  const { apiUrl: storedApiUrl, setApiUrl, completeSignIn } = useAuth();
  const [apiUrl, setApiUrlField] = useState(storedApiUrl ?? '');
  const [editingServer, setEditingServer] = useState(!storedApiUrl);
  const [tab, setTab] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [telegramChatId, setTelegramChatIdField] = useState('');
  const [pasted, setPasted] = useState('');
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    getSecureItem(TELEGRAM_CHAT_ID_KEY).then((stored) => {
      if (stored) setTelegramChatIdField(stored);
    });
  }, []);

  const handleRequestLink = async () => {
    setRequestError(null);
    setRequestMessage(null);
    if (!apiUrl.trim()) {
      setEditingServer(true);
      setRequestError('Server URL is required.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setRequestError('Enter a valid email address.');
      return;
    }
    setIsRequesting(true);
    try {
      await setApiUrl(apiUrl.trim());
      const trimmedChatId = telegramChatId.trim();
      if (trimmedChatId) await setSecureItem(TELEGRAM_CHAT_ID_KEY, trimmedChatId);
      const { message } = await requestMagicLink(apiUrl.trim(), email.trim(), trimmedChatId || undefined);
      // Same neutral message whether or not the email is recognized (no-enumeration).
      setRequestMessage(message || 'If that email has an account, a login link was sent.');
      setTab(2);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request a link.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerify = async () => {
    setVerifyError(null);
    if (!apiUrl.trim() || !pasted.trim()) {
      setVerifyError('Server URL and a pasted link/token are both required.');
      return;
    }
    setIsVerifying(true);
    try {
      await setApiUrl(apiUrl.trim());
      const token = extractToken(pasted);
      const result = await verifyMagicLinkToken(apiUrl.trim(), token);
      await completeSignIn(result, apiUrl.trim());
      if (EMAIL_PATTERN.test(email.trim())) await setSecureItem(EMAIL_KEY, email.trim());
      router.replace('/');
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <FormScreenPlain contentContainerStyle={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.brandMark}>7</Text>
      </View>
      <Text style={styles.title}>7AI Studio</Text>
      <Text style={styles.subtitle}>Sign in to review and ship your Shorts.</Text>

      <View style={styles.serverBox}>
        <View style={styles.serverRow}>
          <Feather name="server" size={18} color={color.muted} />
          <Text style={styles.serverLabel}>Server</Text>
          <Text style={styles.serverValue} numberOfLines={1}>
            {apiUrl || 'Not set'}
          </Text>
          <Pressable
            onPress={() => {
              // Sprint 3 Task 10 (R2) — persist on "Done" immediately, not
              // only inside handleRequestLink/handleVerify on form submit —
              // that was the one real save-timing gap (confirmed by direct
              // read: setApiUrl was previously only called from those two
              // handlers). setApiUrl itself now also re-checks reachability
              // (lib/auth.tsx), so this alone surfaces server-down promptly
              // if the new value is bad.
              if (editingServer) {
                const trimmed = apiUrl.trim();
                if (trimmed) void setApiUrl(trimmed);
              }
              setEditingServer((v) => !v);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.link}>{editingServer ? 'Done' : 'Change'}</Text>
          </Pressable>
        </View>
        {editingServer ? (
          <>
            <View style={styles.presetRow}>
              <Pressable
                style={styles.presetChip}
                onPress={() => {
                  setApiUrlField(LOCAL_API_URL);
                  void setApiUrl(LOCAL_API_URL);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.presetChipText}>Local</Text>
              </Pressable>
              <Pressable
                style={styles.presetChip}
                onPress={() => {
                  setApiUrlField(PREVIEW_API_URL);
                  void setApiUrl(PREVIEW_API_URL);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.presetChipText}>Preview</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrlField}
              placeholder="http://192.168.1.10:4000"
              placeholderTextColor={color.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Tap a preset, or type a custom URL — your computer&apos;s LAN IP (e.g. 192.168.1.23:4000)
              for local dev, since this device can&apos;t reach your computer&apos;s own localhost, or a
              Tailscale Funnel URL.
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.segment}>
        {([1, 2] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.segmentItem, tab === t && styles.segmentItemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.segmentText, tab === t && { color: color.ink }]}>
              {t === 1 ? '1 · Get a token' : '2 · Enter token'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 1 ? (
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={color.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.label}>Telegram chat ID (optional)</Text>
          <TextInput
            style={styles.input}
            value={telegramChatId}
            onChangeText={setTelegramChatIdField}
            placeholder="e.g. 123456789"
            placeholderTextColor={color.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
          />
          <Text style={styles.hint}>
            Send /start to {BOT_NAME} on Telegram — it replies with your ID. Needed once; this phone
            remembers it.
          </Text>
          <PrimaryButton label="Send my token" onPress={handleRequestLink} loading={isRequesting} />
          {requestMessage ? <Text style={styles.ok}>{requestMessage}</Text> : null}
          {requestError ? <Text style={styles.error}>{requestError}</Text> : null}
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Sign-in link or token</Text>
          <TextInput
            style={styles.input}
            value={pasted}
            onChangeText={setPasted}
            placeholder="Paste the link or raw token"
            placeholderTextColor={color.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PrimaryButton label="Verify & sign in" onPress={handleVerify} loading={isVerifying} />
          {verifyError ? <Text style={styles.error}>{verifyError}</Text> : null}
        </View>
      )}
    </FormScreenPlain>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xxl, gap: space.md },
  brand: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
  },
  brandMark: { fontFamily: font.black, fontSize: 30, color: color.onAccent },
  title: { fontFamily: font.black, fontSize: 32, color: color.ink },
  subtitle: { ...type.body, color: color.muted, marginBottom: space.sm },
  serverBox: { borderWidth: 1.5, borderColor: color.ink, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  presetRow: { flexDirection: 'row', gap: space.sm },
  presetChip: {
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  presetChipText: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  serverLabel: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  serverValue: { ...type.meta, flex: 1 },
  link: { fontFamily: font.bold, fontSize: 14, color: color.accentText },
  segment: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: color.bg },
  segmentText: { fontFamily: font.semibold, fontSize: 14, color: color.muted },
  form: { gap: space.sm },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  hint: { ...type.meta, fontSize: 12 },
  input: {
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    ...type.body,
    color: color.ink,
  },
  ok: { ...type.body, color: color.okText },
  error: { ...type.body, color: color.danger },
});

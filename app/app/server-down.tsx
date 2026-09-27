import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { color, space, type } from '../lib/theme';

// Bugs Task 8 (R2) — where the signed-in app lands when the API can't be
// reached (app/(app)/_layout.tsx redirects here on serverStatus === 'down'),
// instead of every screen spinning forever. Outside the (app) group so it
// renders without any tRPC query of its own.
export default function ServerDownScreen() {
  const { apiUrl, checkServer, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);

  const retry = async () => {
    setChecking(true);
    const reachable = await checkServer();
    setChecking(false);
    if (reachable) {
      router.replace('/');
    } else {
      setStillDown(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconTile}>
        <Feather name="cloud-off" size={28} color={color.accent} />
      </View>
      <Text style={styles.title}>Can&apos;t reach the server</Text>
      <Text style={styles.body}>
        The 7AI server isn&apos;t responding right now — it may be down or restarting. Your runs are safe; nothing
        is lost while it&apos;s offline.
      </Text>
      {apiUrl ? <Text style={styles.meta}>{apiUrl}</Text> : null}
      {stillDown ? <Text style={styles.error}>Still unreachable. Try again in a minute.</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Try again" icon="refresh-cw" loading={checking} onPress={() => void retry()} />
        <SecondaryButton
          label="Sign out"
          icon="log-out"
          disabled={checking}
          onPress={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
    backgroundColor: color.bg,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentSoft,
  },
  title: { ...type.screenTitle, color: color.ink },
  body: { ...type.body, color: color.ink },
  meta: { ...type.meta },
  error: { ...type.body, color: color.danger },
  actions: { gap: space.sm, marginTop: space.md },
});

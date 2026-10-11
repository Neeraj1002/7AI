import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../components/Screen';
import { ActionButton } from '../../../components/admin/ActionButton';
import { isForbiddenError, useIsAdmin } from '../../../lib/use-admin';
import { color, space, type } from '../../../lib/theme';

// Admin Sprint 1 FE (R1) — gate for every route under /admin. Non-Admins are sent
// home; an Admin whose flag is revoked mid-session sees "Admin access ended"
// (any FORBIDDEN from an admin query, or whoami turning false after it was true).
// Hiding the entry is a convenience only: the server re-checks every call.
export default function AdminLayout() {
  const { isAdmin, isLoading } = useIsAdmin();
  const queryClient = useQueryClient();
  const [accessEnded, setAccessEnded] = useState(false);
  const wasAdmin = useRef(false);

  useEffect(() => {
    if (isAdmin) wasAdmin.current = true;
    else if (wasAdmin.current && !isLoading) setAccessEnded(true);
  }, [isAdmin, isLoading]);

  useEffect(() => {
    const isAdminKey = (key: readonly unknown[]) => Array.isArray(key[0]) && key[0][0] === 'admin';
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        (event.action.type === 'error' || event.action.type === 'failed') &&
        isAdminKey(event.query.queryKey) &&
        isForbiddenError(event.action.error)
      ) {
        setAccessEnded(true);
      }
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && (event.action.type === 'error' || event.action.type === 'failed') && isForbiddenError(event.action.error)) {
        setAccessEnded(true);
      }
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [queryClient]);

  if (accessEnded) {
    return (
      <Screen title="Admin" variant="stack" onBack={() => router.replace('/')}>
        <View style={styles.center}>
          <Text style={styles.title}>Admin access ended</Text>
          <Text style={styles.body}>Your Admin access was removed. Nothing here can be shown any more.</Text>
          <ActionButton label="Back to the app" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }
  if (isLoading) {
    return (
      <View style={styles.center} accessibilityLabel="Loading">
        <ActivityIndicator color={color.accent} />
      </View>
    );
  }
  if (!isAdmin) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: color.bg },
  title: { ...type.stackTitle, color: color.ink },
  body: { ...type.body, color: color.muted, textAlign: 'center' },
});

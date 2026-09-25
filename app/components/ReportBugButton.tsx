import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { usePathname } from 'expo-router';
import { useAuth } from '../lib/auth';

// Run/screen context for studio/src/api/bug-report-page.ts's already-built
// bug-report tool. Derived fresh from the router at tap time (usePathname()),
// never from a separately-maintained "current context" store — a screen that
// forgets to clear a mutable store is worse than no runId at all, since a
// wrong runId actively misleads triage instead of just being absent.
//
// Matches the real route this app navigates to for Run Detail
// (`router.push(\`/run/${id}\`)`, confirmed in app/(app)/index.tsx and
// app/_layout.tsx) — the (app) route group itself is invisible in
// usePathname()'s output.
const RUN_DETAIL_PATTERN = /^\/run\/([^/]+)$/;

export function ReportBugButton() {
  const pathname = usePathname();
  const { apiUrl } = useAuth();

  const handlePress = async () => {
    if (!apiUrl) return;
    const match = pathname.match(RUN_DETAIL_PATTERN);
    const runId = match ? match[1] : null;
    // Same manual query-string convention lib/auth-api.ts's own
    // verifyMagicLinkToken already uses, not the URL/URLSearchParams classes.
    let query = `screen=${encodeURIComponent(pathname)}`;
    if (runId) {
      query += `&runId=${encodeURIComponent(runId)}`;
    }
    const url = `${apiUrl.replace(/\/$/, '')}/bugs?${query}`;
    await WebBrowser.openBrowserAsync(url);
  };

  return (
    <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
      <Text style={styles.icon}>🐞</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 4, paddingVertical: 4 },
  icon: { fontSize: 18 },
});

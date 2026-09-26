import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { usePathname } from 'expo-router';
import { useAuth } from '../lib/auth';
import { IconButton } from './IconButton';

// Bugs Task 3 (R2) — the deep link bug-report-page.ts's success handler
// redirects to once a report is actually saved. openAuthSessionAsync
// watches for a navigation to this exact URL and resolves + auto-closes
// the in-app browser the moment it fires — a definite "done" signal,
// unlike openBrowserAsync's old fire-and-forget open with no return signal
// at all.
const BUG_REPORT_RETURN_URL = 'sevenai://bugs-submitted';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    if (!apiUrl || isSubmitting) return;
    const match = pathname.match(RUN_DETAIL_PATTERN);
    const runId = match ? match[1] : null;
    // Same manual query-string convention lib/auth-api.ts's own
    // verifyMagicLinkToken already uses, not the URL/URLSearchParams classes.
    let query = `screen=${encodeURIComponent(pathname)}`;
    if (runId) {
      query += `&runId=${encodeURIComponent(runId)}`;
    }
    const url = `${apiUrl.replace(/\/$/, '')}/bugs?${query}`;

    setIsSubmitting(true);
    try {
      // Bugs Task 3 (R2) — openAuthSessionAsync, not openBrowserAsync: the
      // former resolves with a real, awaitable result the moment the page
      // redirects to BUG_REPORT_RETURN_URL, giving this button an actual
      // "done" signal instead of firing-and-forgetting the whole flow. A
      // failed submit never redirects (bug-report-page.ts's own catch path
      // leaves the browser open with its red error text), so 'success' here
      // specifically means the report was saved server-side, not just that
      // the browser closed for any reason.
      const result = await WebBrowser.openAuthSessionAsync(url, BUG_REPORT_RETURN_URL);
      if (result.type === 'success') {
        Alert.alert('Thanks — logged.', 'Your bug report was saved.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <IconButton
      name="bug-outline"
      variant="community"
      onPress={handlePress}
      accessibilityLabel="Report a bug"
    />
  );
}

const styles = StyleSheet.create({
  loading: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

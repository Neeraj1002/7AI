import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';

// Bugs Task 4 (R1) — a safety net, not the primary path. ReportBugButton.tsx's
// WebBrowser.openAuthSessionAsync(url, 'sevenai://bugs-submitted') normally
// intercepts this redirect itself and resolves before it ever becomes a real
// deep link — but that interception isn't guaranteed on Android (varies by
// which Custom Tabs implementation the OS picks). Without a real route file
// here, a redirect the OS doesn't intercept lands on Expo Router's own
// "Unmatched Route" screen instead — confirmed live. Only ever reached via
// the success path: bug-report-page.ts's client script redirects here only
// inside its .then() after a successful POST; a failed submit leaves the
// browser open on its own error text instead (Bugs Task 3/R2's own design),
// so there's nothing for this route to handle on the failure side.
export default function BugsSubmittedScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Thanks — logged.</Text>
      <Text style={styles.subtitle}>Your bug report was saved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#666' },
});

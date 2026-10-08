import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { color, font, space, type } from '../lib/theme';
import { SecondaryButton } from './Buttons';

// Hardening (OTA fingerprint) R4 - makes an OTA update visible and applicable on the phone.
// expo-updates' checkAutomatically "ON_LOAD" downloads an update at launch but only applies it on
// the NEXT cold start, which feels like "the update never arrived". This block shows exactly what
// the phone is running and lets the user check, download and apply an update on the spot.
// Everything is guarded by Updates.isEnabled so dev builds and web never touch the native module.

type CheckState =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'message'; text: string; isError?: boolean };

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// The runtime is a 40-character hash; the first 8 are enough to compare by eye.
function shortRuntime(runtime: string | null): string {
  if (!runtime) return '—';
  return /^[0-9a-f]{40}$/.test(runtime) ? runtime.slice(0, 8) : runtime;
}

export function AppBuildInfo() {
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const enabled = Updates.isEnabled;

  const rows: [string, string][] = enabled
    ? [
        ['Runtime', shortRuntime(Updates.runtimeVersion)],
        ['Update', Updates.isEmbeddedLaunch ? 'embedded build (no update applied)' : (Updates.updateId?.slice(0, 8) ?? '—')],
        ['Update date', Updates.isEmbeddedLaunch ? '—' : formatDate(Updates.createdAt)],
        ['Channel', Updates.channel ?? '—'],
      ]
    : [['Updates', 'off in this build (development or web)']];

  const check = async () => {
    if (!enabled) return;
    setState({ kind: 'working', label: 'Checking…' });
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setState({
          kind: 'message',
          text: 'No update for this build. You are up to date, or the newest update was published for a different build of the app.',
        });
        return;
      }
      setState({ kind: 'working', label: 'Downloading…' });
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) {
        setState({ kind: 'message', text: 'You already have the latest update.' });
        return;
      }
      setState({ kind: 'working', label: 'Restarting…' });
      await Updates.reloadAsync();
    } catch (error) {
      setState({ kind: 'message', isError: true, text: `Couldn't check for updates: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  return (
    <View style={styles.block}>
      <Text style={styles.title}>App build</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.meta}>{label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
      {enabled ? (
        <SecondaryButton
          label={state.kind === 'working' ? state.label : 'Check for update'}
          icon="download"
          disabled={state.kind === 'working'}
          onPress={check}
        />
      ) : null}
      {state.kind === 'message' ? (
        <Text style={[styles.meta, state.isError && styles.error]}>{state.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  title: { ...type.bodyStrong, color: color.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  meta: { ...type.meta },
  value: { fontFamily: font.semibold, fontSize: 14, color: color.ink, flexShrink: 1 },
  error: { color: color.danger },
});

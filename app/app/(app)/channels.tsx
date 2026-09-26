import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '../../lib/trpc';
import { useChannels, type Channel } from '../../lib/channel-context';

// Sprint 3 Frontend Task 2 (FE8/FE9) — the Channels screen
// MOBILE_APP_DESIGN.md Section 4 explicitly deferred out of v1, un-deferred
// now that Sprint 3 backend Tasks 5/6 give it real endpoints to reach:
// `channels.create`, `channels.getYoutubeConnectUrl`, `channels.disconnectYoutube`.
export default function ChannelsScreen() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { channels, isLoading } = useChannels();

  const [name, setName] = useState('');
  const [nicheDescription, setNicheDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });

  const createChannel = useMutation(
    trpc.channels.create.mutationOptions({
      onSuccess: async () => {
        setName('');
        setNicheDescription('');
        await invalidateChannels();
      },
      // FE8's real cap-exceeded proof: the same setError(err.message) pattern
      // new-brief.tsx/login.tsx already use — no new error-handling pattern
      // invented for this one case.
      onError: (err) => setCreateError(err.message),
    }),
  );

  const disconnectYoutube = useMutation(
    trpc.channels.disconnectYoutube.mutationOptions({
      onSuccess: () => invalidateChannels(),
    }),
  );

  const handleCreate = () => {
    setCreateError(null);
    if (!name.trim() || !nicheDescription.trim()) {
      setCreateError('Name and niche description are both required.');
      return;
    }
    createChannel.mutate({ platform: 'youtube', name: name.trim(), nicheDescription: nicheDescription.trim() });
  };

  // FE9's real OAuth round trip: fetches the real Google consent URL via a
  // one-off imperative call (not a background useQuery — this only ever runs
  // on a tap), opens it via expo-web-browser's openAuthSessionAsync (the
  // standard Expo pattern for a flow that needs to hand control back to the
  // app), then refetches `channels.list` on return — never optimistic, since
  // the flow can be cancelled or fail on Google's own side.
  const handleConnect = async (channel: Channel) => {
    setConnectError(null);
    setConnectingId(channel.id);
    try {
      const { authUrl } = await trpcClient.channels.getYoutubeConnectUrl.query({ channelId: channel.id });
      await WebBrowser.openAuthSessionAsync(authUrl);
      await invalidateChannels();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start the connect flow.');
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = (channel: Channel) => {
    setConnectError(null);
    disconnectYoutube.mutate({ channelId: channel.id });
  };

  return (
    // Bugs Task 3 (R4) — same KeyboardAvoidingView pattern as the other
    // screens: the "Create channel" name/niche-description fields live in
    // this FlatList's own footer, which a bare FlatList never pushes above
    // the keyboard on its own.
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlatList
      contentContainerStyle={styles.container}
      data={channels}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <>
          <Text style={styles.sectionTitle}>Channels</Text>
          {isLoading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
          {connectError ? <Text style={styles.error}>{connectError}</Text> : null}
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.platform}</Text>
            <Text style={item.hasYoutubeCredential ? styles.badgeConnected : styles.badgeNotConnected}>
              {item.hasYoutubeCredential ? 'YouTube connected' : 'YouTube not connected'}
            </Text>
          </View>
          {item.hasYoutubeCredential ? (
            <Pressable
              style={[styles.smallButton, styles.disconnectButton]}
              onPress={() => handleDisconnect(item)}
              disabled={disconnectYoutube.isPending}
            >
              <Text style={styles.smallButtonText}>Disconnect</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.smallButton}
              onPress={() => handleConnect(item)}
              disabled={connectingId === item.id}
            >
              {connectingId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.smallButtonText}>Connect YouTube</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
      ListFooterComponent={
        <View style={styles.createSection}>
          <Text style={styles.sectionTitle}>Create channel</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Channel name" />
          <Text style={styles.label}>Niche description</Text>
          <TextInput
            style={styles.input}
            value={nicheDescription}
            onChangeText={setNicheDescription}
            placeholder="e.g. Bite-sized science facts"
          />
          <Text style={styles.hint}>Platform: YouTube (the only one supported today)</Text>
          {createError ? <Text style={styles.error}>{createError}</Text> : null}
          <Pressable
            style={[styles.button, createChannel.isPending && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={createChannel.isPending}
          >
            {createChannel.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create channel</Text>
            )}
          </Pressable>
        </View>
      }
    />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  badgeConnected: { fontSize: 12, color: '#1a7f37', fontWeight: '600', marginTop: 4 },
  badgeNotConnected: { fontSize: 12, color: '#888', marginTop: 4 },
  smallButton: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  disconnectButton: { backgroundColor: '#c0392b' },
  smallButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  createSection: { marginTop: 24, gap: 4 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  hint: { fontSize: 12, color: '#888', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: '#c00', marginTop: 8 },
  button: { marginTop: 16, backgroundColor: '#111', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

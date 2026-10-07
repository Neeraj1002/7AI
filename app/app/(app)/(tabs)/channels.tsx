import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useIsAdmin } from '../../../lib/use-admin';
import { usePushStatus } from '../../../lib/push';
import { useChannels, type Channel } from '../../../lib/channel-context';
import { deleteSecureItem, getSecureItem } from '../../../lib/storage';
import { EMAIL_KEY } from '../../../lib/session-keys';
import { color, font, radius, space, type } from '../../../lib/theme';
import { Screen } from '../../../components/Screen';
import { Card } from '../../../components/Card';
import { ChannelAvatar } from '../../../components/ChannelAvatar';
import { StatusChip } from '../../../components/StatusChip';
import { BottomSheet } from '../../../components/BottomSheet';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { PrimaryButton } from '../../../components/Buttons';

const MAX_CHANNELS = 7;

export default function ChannelsScreen() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { apiUrl, signOut } = useAuth();
  const { channels, isLoading } = useChannels();
  const { isAdmin } = useIsAdmin();
  const pushStatus = usePushStatus();

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getSecureItem(EMAIL_KEY).then(setEmail);
  }, []);

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });

  // Opens Google's consent page via openAuthSessionAsync, then refetches
  // channels.list on return — never optimistic, since the flow can be
  // cancelled or fail on Google's side.
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

  const atCap = channels.length >= MAX_CHANNELS;
  const host = apiUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '—';

  const handleSignOut = async () => {
    setSignOutOpen(false);
    await deleteSecureItem(EMAIL_KEY);
    await signOut();
    router.replace('/login');
  };

  return (
    <Screen variant="tabRoot" title="Channels" subtitle={`${channels.length} of ${MAX_CHANNELS} channels used`}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void invalidateChannels()} />}
      >
        {isLoading ? <Text style={styles.meta}>Loading…</Text> : null}
        {connectError ? <Text style={styles.error}>{connectError}</Text> : null}

        {channels.map((c, i) => (
          <Card key={c.id} style={styles.channelCard}>
            <Pressable
              style={styles.channelTop}
              onPress={() => router.push(`/channel/${c.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${c.name}`}
            >
              <ChannelAvatar index={i} size={44} />
              <View style={styles.channelText}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {c.nicheDescription}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={color.muted} />
            </Pressable>
            <View style={styles.channelBottom}>
              <StatusChip
                kind={c.hasYoutubeCredential ? 'ok' : 'attention'}
                label={c.hasYoutubeCredential ? 'YouTube connected' : 'YouTube not connected'}
              />
              {!c.hasYoutubeCredential ? (
                <Pressable
                  style={styles.connect}
                  onPress={() => handleConnect(c)}
                  disabled={connectingId === c.id}
                  accessibilityRole="button"
                >
                  <Feather name="play" size={14} color={color.accentText} />
                  <Text style={styles.connectText}>{connectingId === c.id ? 'Opening…' : 'Connect'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))}

        <Pressable
          style={[styles.add, atCap && styles.addDisabled]}
          onPress={() => setCreateOpen(true)}
          disabled={atCap}
          accessibilityRole="button"
        >
          <Feather name="plus" size={18} color={atCap ? color.muted : color.ink} />
          <Text style={[styles.addText, atCap && { color: color.muted }]}>
            {atCap ? `${MAX_CHANNELS} of ${MAX_CHANNELS} used` : 'Add channel'}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Account</Text>
        <Card style={styles.account}>
          {email ? (
            <View style={styles.accountRow}>
              <Text style={styles.meta}>Signed in as</Text>
              <Text style={styles.accountValue} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}
          <View style={styles.accountRow}>
            <Text style={styles.meta}>Server</Text>
            <Text style={styles.accountValue} numberOfLines={1}>
              {host}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.meta}>Version</Text>
            <Text style={styles.accountValue} numberOfLines={1}>
              {Application.nativeApplicationVersion ?? '—'} · {Updates.updateId?.slice(0, 8) ?? 'built-in'}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.meta}>Push</Text>
            <Text style={styles.accountValue} numberOfLines={1}>
              {pushStatus.state === 'on'
                ? 'on'
                : pushStatus.state === 'off'
                  ? 'off (permission denied)'
                  : pushStatus.state === 'error'
                    ? `error: ${pushStatus.reason}`
                    : 'checking…'}
            </Text>
          </View>
          {isAdmin ? (
            <Pressable
              style={styles.adminRow}
              onPress={() => router.push('/admin')}
              accessibilityRole="button"
              accessibilityLabel="Admin"
            >
              <Feather name="shield" size={18} color={color.ink} />
              <Text style={styles.adminText}>Admin</Text>
              <Feather name="chevron-right" size={18} color={color.muted} />
            </Pressable>
          ) : null}
          <Pressable style={styles.signOut} onPress={() => setSignOutOpen(true)} accessibilityRole="button">
            <Feather name="log-out" size={18} color={color.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </Card>
      </ScrollView>

      <CreateChannelSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        icon="log-out"
        title="Sign out?"
        body="You'll need a new sign-in token to get back in."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleSignOut}
      />
    </Screen>
  );
}

function CreateChannelSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nicheDescription, setNicheDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createChannel = useMutation(
    trpc.channels.create.mutationOptions({
      onSuccess: async () => {
        setName('');
        setNicheDescription('');
        await queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });
        onClose();
      },
      // Surfaces ChannelCapExceededError's message as-is.
      onError: (err) => setError(err.message),
    }),
  );

  const handleCreate = () => {
    setError(null);
    if (!name.trim() || !nicheDescription.trim()) {
      setError('Name and niche description are both required.');
      return;
    }
    createChannel.mutate({ platform: 'youtube', name: name.trim(), nicheDescription: nicheDescription.trim() });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Add channel</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Channel name"
        placeholderTextColor={color.muted}
      />
      <Text style={styles.label}>Niche description</Text>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={[styles.input, styles.multiline]}
        value={nicheDescription}
        onChangeText={setNicheDescription}
        placeholder="e.g. Bite-sized science facts"
        placeholderTextColor={color.muted}
        multiline
        scrollEnabled
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Create channel" onPress={handleCreate} loading={createChannel.isPending} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  meta: { ...type.meta },
  error: { ...type.body, color: color.danger },
  channelCard: { gap: space.md },
  channelTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  channelText: { flex: 1 },
  channelName: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  channelBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connect: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: space.sm },
  connectText: { fontFamily: font.bold, fontSize: 14, color: color.accentText },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 54,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
  },
  addDisabled: { borderColor: color.border },
  addText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  sectionTitle: { ...type.sectionTitle, color: color.ink, marginTop: space.md },
  account: { gap: space.md },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  accountValue: { fontFamily: font.semibold, fontSize: 14, color: color.ink, flexShrink: 1 },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  adminText: { fontFamily: font.bold, fontSize: 15, color: color.ink, flex: 1 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  signOutText: { fontFamily: font.bold, fontSize: 15, color: color.danger },
  sheetTitle: { ...type.stackTitle, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  input: {
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...type.body,
    color: color.ink,
  },
  multiline: { minHeight: 90, maxHeight: 180, textAlignVertical: 'top' },
});

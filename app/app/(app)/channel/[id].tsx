import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '../../../lib/trpc';
import { useChannels } from '../../../lib/channel-context';
import { flags } from '../../../lib/feature-flags';
import { color, font, radius, space, type } from '../../../lib/theme';
import { FormScreen } from '../../../components/FormScreen';
import { Card } from '../../../components/Card';
import { ChannelAvatar } from '../../../components/ChannelAvatar';
import { StatusChip } from '../../../components/StatusChip';
import { BottomActionBar } from '../../../components/BottomActionBar';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { PrimaryButton, SecondaryButton } from '../../../components/Buttons';

type Privacy = 'private' | 'unlisted' | 'public';

// channels.update / channels.archive don't exist server-side until backend
// items B2/B3 merge; every call below sits behind flags.channelEdit /
// flags.channelDelete, so this loose typing is never exercised while the
// flags are false. Replace with the real inferred types when flipping them.
type PendingBackendClient = {
  channels: {
    update: { mutate: (i: { channelId: string; name?: string; nicheDescription?: string; defaultPrivacyStatus?: Privacy }) => Promise<unknown> };
    archive: { mutate: (i: { channelId: string }) => Promise<unknown> };
  };
};

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { channelById, channelIndex } = useChannels();
  const channel = channelById(id);
  const index = channelIndex(id);

  const operational = useQuery(trpc.dashboard.operational.queryOptions({ channelId: id }));
  const cost = useQuery(trpc.dashboard.cost.queryOptions({ channelId: id }));

  const [barHeight, setBarHeight] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [niche, setNiche] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });

  const disconnect = useMutation(
    trpc.channels.disconnectYoutube.mutationOptions({ onSuccess: () => invalidateChannels() }),
  );

  const save = useMutation({
    mutationFn: () =>
      (trpcClient as unknown as PendingBackendClient).channels.update.mutate({
        channelId: id!,
        name: (name ?? channel?.name ?? '').trim(),
        nicheDescription: (niche ?? channel?.nicheDescription ?? '').trim(),
        ...(flags.gate2Visibility && privacy ? { defaultPrivacyStatus: privacy } : {}),
      }),
    onSuccess: async () => {
      setName(null);
      setNiche(null);
      setPrivacy(null);
      await invalidateChannels();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
  });

  const remove = useMutation({
    mutationFn: () => (trpcClient as unknown as PendingBackendClient).channels.archive.mutate({ channelId: id! }),
    onSuccess: async () => {
      await invalidateChannels();
      router.replace('/channels');
    },
    onError: (err) => {
      setDeleteOpen(false);
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    },
  });

  if (!channel) {
    return (
      <FormScreen variant="stack" title="Channel">
        <Text style={styles.notFound}>Channel not found.</Text>
      </FormScreen>
    );
  }

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const { authUrl } = await trpcClient.channels.getYoutubeConnectUrl.query({ channelId: channel.id });
      await WebBrowser.openAuthSessionAsync(authUrl);
      await invalidateChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the connect flow.');
    } finally {
      setConnecting(false);
    }
  };

  const runs = operational.data?.stageFunnel.find((r) => r.stage === 'intake')?.count;
  const published = cost.data?.costPerPublishedVideo.publishedCount;
  const spend = cost.data?.totalSpendUsd;
  const metaParts = [
    runs !== undefined ? `${runs} runs` : null,
    published !== undefined ? `${published} published` : null,
    spend !== undefined ? `$${spend.toFixed(2)} spent` : null,
  ].filter(Boolean);

  const dirty =
    (name !== null && name.trim() !== channel.name) ||
    (niche !== null && niche.trim() !== channel.nicheDescription) ||
    privacy !== null;
  const canSave = dirty && !!(name ?? channel.name).trim() && !!(niche ?? channel.nicheDescription).trim();

  const footer = flags.channelEdit ? (
    <BottomActionBar onHeight={setBarHeight}>
      <PrimaryButton label="Save changes" onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} />
    </BottomActionBar>
  ) : null;

  return (
    <FormScreen
      variant="stack"
      title="Channel"
      contentContainerStyle={[styles.content, { paddingBottom: barHeight + space.xl }]}
      footer={footer}
    >
      <View style={styles.header}>
        <ChannelAvatar index={index} size={60} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {channel.name}
          </Text>
          {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}
        </View>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Details</Text>
        <Text style={styles.label}>Name</Text>
        {flags.channelEdit ? (
          <TextInput
            style={styles.input}
            value={name ?? channel.name}
            onChangeText={setName}
            placeholderTextColor={color.muted}
          />
        ) : (
          <Text style={styles.body}>{channel.name}</Text>
        )}
        <Text style={styles.label}>Niche description</Text>
        {flags.channelEdit ? (
          <>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={niche ?? channel.nicheDescription}
              onChangeText={setNiche}
              multiline
              scrollEnabled
              placeholderTextColor={color.muted}
            />
            <Text style={styles.meta}>
              Scripts for new runs use this. Runs already in progress keep the old version.
            </Text>
          </>
        ) : (
          <Text style={styles.body}>{channel.nicheDescription}</Text>
        )}
        {flags.channelEdit && flags.gate2Visibility ? (
          <>
            <Text style={styles.label}>Default YouTube visibility</Text>
            <View style={styles.segment}>
              {(['private', 'unlisted', 'public'] as Privacy[]).map((p) => {
                const current =
                  privacy ?? (channel as { defaultPrivacyStatus?: Privacy }).defaultPrivacyStatus ?? 'private';
                const active = current === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPrivacy(p)}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.segmentText, active && { color: color.ink }]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>YouTube</Text>
        <View style={styles.youtubeRow}>
          <StatusChip
            kind={channel.hasYoutubeCredential ? 'ok' : 'attention'}
            label={channel.hasYoutubeCredential ? 'Connected' : 'Not connected'}
          />
          {channel.hasYoutubeCredential ? (
            <SecondaryButton
              label="Disconnect"
              onPress={() => disconnect.mutate({ channelId: channel.id })}
              loading={disconnect.isPending}
            />
          ) : (
            <SecondaryButton label="Connect" icon="play" onPress={handleConnect} loading={connecting} />
          )}
        </View>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {flags.channelDelete ? (
        <Pressable style={styles.delete} onPress={() => setDeleteOpen(true)} accessibilityRole="button">
          <Feather name="trash-2" size={18} color={color.danger} />
          <Text style={styles.deleteText}>Delete channel</Text>
        </Pressable>
      ) : null}

      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        icon="trash-2"
        title={`Delete "${channel.name}"?`}
        body="It's removed from your channel list, New Brief and the Dashboard picker. Its past runs, videos and spend history are kept."
        warning="Runs still in progress on this channel will be cancelled, and its YouTube connection will be removed."
        confirmLabel="Delete channel"
        destructive
        isConfirming={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  notFound: { ...type.body, color: color.muted, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  name: { fontFamily: font.black, fontSize: 22, color: color.ink },
  meta: { ...type.meta },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 12, color: color.muted, marginTop: space.xs },
  body: { ...type.body, color: color.ink },
  input: {
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    ...type.body,
    color: color.ink,
  },
  multiline: { minHeight: 90, maxHeight: 200, textAlignVertical: 'top' },
  segment: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: color.bg },
  segmentText: { fontFamily: font.semibold, fontSize: 14, color: color.muted },
  youtubeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  error: { ...type.body, color: color.danger },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.dangerBorder,
  },
  deleteText: { fontFamily: font.bold, fontSize: 15, color: color.danger },
});

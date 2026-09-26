import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Switch, BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import { useTRPC, useTRPCClient } from '../../../lib/trpc';
import { useChannels } from '../../../lib/channel-context';
import { flags } from '../../../lib/feature-flags';
import { VOICES } from '../../../lib/pipeline-options';
import { color, font, radius, space, type } from '../../../lib/theme';
import { FormScreen } from '../../../components/FormScreen';
import { Card } from '../../../components/Card';
import { ChannelAvatar } from '../../../components/ChannelAvatar';
import { StatusChip } from '../../../components/StatusChip';
import { BottomActionBar } from '../../../components/BottomActionBar';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { OptionSheet } from '../../../components/OptionSheet';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { PrimaryButton, SecondaryButton } from '../../../components/Buttons';
import type { AppRouter } from '../../../../studio/src/api/router';

type UpdateInput = inferRouterInputs<AppRouter>['channels']['update'];
type Privacy = NonNullable<UpdateInput['defaultPrivacyStatus']>;

// Fields added by backend items B5 (settings) and B7 (gate switches) don't
// exist in the real channels.update input yet. Field names below are the
// app's working names — align them with the merged backend task, and delete
// this type, in the same commit that flips flags.channelSettings /
// flags.gateToggles.
type PendingFields = {
  styleGuide?: string;
  defaultVoice?: string;
  captionsEnabled?: boolean;
  budgetOverrideUsd?: number | null;
  gate1Enabled?: boolean;
  gate2Enabled?: boolean;
};
type Draft = Partial<Pick<UpdateInput, 'name' | 'nicheDescription' | 'defaultPrivacyStatus'>> & PendingFields;

const SPEND_PATTERN = /^\d+(\.\d{1,2})?$/;

export default function ChannelSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { channelById, channelIndex } = useChannels();
  const channel = channelById(id);
  const index = channelIndex(id);
  // Server-side values for fields the inferred channel type doesn't list yet.
  const saved = (channel ?? {}) as PendingFields & { defaultPrivacyStatus?: Privacy };

  const operational = useQuery(trpc.dashboard.operational.queryOptions({ channelId: id }));
  const cost = useQuery(trpc.dashboard.cost.queryOptions({ channelId: id }));

  const [barHeight, setBarHeight] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [spendText, setSpendText] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });
  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));

  const spendInvalid = spendText !== null && spendText.trim() !== '' && (!SPEND_PATTERN.test(spendText.trim()) || Number(spendText) <= 0);
  const changes: Draft = { ...draft };
  if (spendText !== null && !spendInvalid) {
    const next = spendText.trim() === '' ? null : Number(spendText);
    if (next !== (saved.budgetOverrideUsd ?? null)) changes.budgetOverrideUsd = next;
  }
  // Drop entries equal to what's already saved so only real changes are sent.
  const persisted: Record<string, unknown> = { ...saved, name: channel?.name, nicheDescription: channel?.nicheDescription };
  for (const key of Object.keys(changes) as (keyof Draft)[]) {
    if (changes[key] === persisted[key]) delete changes[key];
  }
  const dirty = Object.keys(changes).length > 0 || spendInvalid;
  const emptyName = draft.name !== undefined && !draft.name.trim();
  const emptyNiche = draft.nicheDescription !== undefined && !draft.nicheDescription.trim();
  const canSave = Object.keys(changes).length > 0 && !spendInvalid && !emptyName && !emptyNiche;

  const goBack = () => {
    if (dirty) setDiscardOpen(true);
    else router.back();
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dirty) {
        setDiscardOpen(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dirty]);

  const disconnect = useMutation(
    trpc.channels.disconnectYoutube.mutationOptions({ onSuccess: () => invalidateChannels() }),
  );

  const save = useMutation({
    mutationFn: () => {
      // Real typed call; B5/B7 extras ride along in the same single request.
      const payload = { channelId: id!, ...changes } as UpdateInput;
      return trpcClient.channels.update.mutate(payload);
    },
    onSuccess: async () => {
      setError(null);
      setDraft({});
      setSpendText(null);
      await Promise.all([
        invalidateChannels(),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.cost.queryKey({ channelId: id }) }),
      ]);
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2000);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
  });

  const remove = useMutation({
    mutationFn: () => trpcClient.channels.archive.mutate({ channelId: id! }),
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

  const name = draft.name ?? channel.name;
  const niche = draft.nicheDescription ?? channel.nicheDescription;
  const styleGuide = draft.styleGuide ?? saved.styleGuide ?? '';
  const voice = draft.defaultVoice ?? saved.defaultVoice ?? null;
  const captions = draft.captionsEnabled ?? saved.captionsEnabled ?? true;
  const visibility: Privacy = draft.defaultPrivacyStatus ?? saved.defaultPrivacyStatus ?? 'private';
  const gate1 = draft.gate1Enabled ?? saved.gate1Enabled ?? true;
  const gate2 = draft.gate2Enabled ?? saved.gate2Enabled ?? true;
  const limit = spendText !== null ? Number(spendText) : (saved.budgetOverrideUsd ?? null);
  const limitValid = limit !== null && !Number.isNaN(limit) && limit > 0;

  const canEdit = flags.channelEdit || flags.channelSettings || flags.gateToggles;
  const showVoiceLook = flags.channelSettings;
  const showPublishingVisibility = flags.gate2Visibility && flags.channelEdit;

  const footer = canEdit ? (
    <BottomActionBar onHeight={setBarHeight}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedNote ? <Text style={styles.saved}>Saved</Text> : null}
      <PrimaryButton label="Save changes" onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} />
    </BottomActionBar>
  ) : null;

  return (
    <FormScreen
      variant="stack"
      title="Channel"
      onBack={goBack}
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
        <Text style={styles.cardTitle}>Identity</Text>
        <Text style={styles.label}>Name</Text>
        {flags.channelEdit ? (
          <TextInput style={styles.input} value={name} onChangeText={(v) => set({ name: v })} />
        ) : (
          <Text style={styles.body}>{channel.name}</Text>
        )}
        <Text style={styles.label}>Niche description</Text>
        {flags.channelEdit ? (
          <>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={niche}
              onChangeText={(v) => set({ nicheDescription: v })}
              multiline
              scrollEnabled
            />
            <Text style={styles.meta}>Scripts for new runs use this. Runs already in progress keep the old version.</Text>
          </>
        ) : (
          <Text style={styles.body}>{channel.nicheDescription}</Text>
        )}
        {flags.channelSettings ? (
          <>
            <Text style={styles.label}>Style guide</Text>
            <TextInput
              style={[styles.input, styles.multiline, styles.styleGuide]}
              value={styleGuide}
              onChangeText={(v) => set({ styleGuide: v })}
              placeholder="Tone, words to avoid, how hooks should sound, audience…"
              placeholderTextColor={color.muted}
              multiline
              scrollEnabled
            />
          </>
        ) : null}
      </Card>

      {showVoiceLook ? (
        <Card>
          <Text style={styles.cardTitle}>Voice &amp; look</Text>
          <Pressable style={styles.row} onPress={() => setVoiceOpen(true)} accessibilityRole="button">
            <Feather name="mic" size={20} color={color.muted} />
            <View style={styles.rowText}>
              <Text style={styles.rowCaption}>Default voice</Text>
              <Text style={styles.rowValue}>{VOICES.find((v) => v.value === voice)?.label ?? 'Alloy'}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={color.muted} />
          </Pressable>
          <View style={styles.switchRow}>
            <Text style={styles.rowValue}>Captions</Text>
            <Switch
              value={captions}
              onValueChange={(v) => set({ captionsEnabled: v })}
              trackColor={{ true: color.accent, false: color.future }}
              thumbColor={color.bg}
            />
          </View>
          {/* Watermark upload (flags.watermarkUpload / B6) is not built: expo-image-picker isn't installed and adding it would change the native fingerprint. */}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Publishing</Text>
        {showPublishingVisibility ? (
          <>
            <Text style={styles.label}>Default visibility</Text>
            <SegmentedControl
              options={[
                { value: 'private' as const, label: 'Private' },
                { value: 'unlisted' as const, label: 'Unlisted' },
                { value: 'public' as const, label: 'Public' },
              ]}
              value={visibility}
              onChange={(v) => set({ defaultPrivacyStatus: v })}
            />
          </>
        ) : null}
        <Text style={styles.label}>YouTube</Text>
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

      {flags.gateToggles ? (
        <Card>
          <Text style={styles.cardTitle}>Approvals</Text>
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowValue}>Gate 1 · approve scripts</Text>
              <Text style={styles.meta}>Pause for your review before video is made.</Text>
            </View>
            <Switch
              value={gate1}
              onValueChange={(v) => set({ gate1Enabled: v })}
              trackColor={{ true: color.accent, false: color.future }}
              thumbColor={color.bg}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowValue}>Gate 2 · approve videos</Text>
              <Text style={styles.meta}>Pause for your review before upload.</Text>
            </View>
            <Switch
              value={gate2}
              onValueChange={(v) => set({ gate2Enabled: v })}
              trackColor={{ true: color.accent, false: color.future }}
              thumbColor={color.bg}
            />
          </View>
        </Card>
      ) : null}

      {flags.channelSettings ? (
        <Card>
          <Text style={styles.cardTitle}>Budget</Text>
          <Text style={styles.label}>Spend limit</Text>
          <View style={[styles.input, styles.moneyRow, spendInvalid && styles.inputInvalid]}>
            <Text style={styles.rowValue}>$</Text>
            <TextInput
              style={styles.moneyInput}
              value={spendText ?? (saved.budgetOverrideUsd != null ? String(saved.budgetOverrideUsd) : '')}
              onChangeText={setSpendText}
              placeholder="auto"
              placeholderTextColor={color.muted}
              keyboardType="decimal-pad"
            />
          </View>
          {spendInvalid ? (
            <Text style={styles.error}>Enter a number above 0 with at most 2 decimals, or leave blank.</Text>
          ) : (
            <Text style={styles.meta}>Default: equal share of the pool</Text>
          )}
          {limitValid && spend !== undefined ? (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, (spend / limit!) * 100)}%` }]} />
              </View>
              <Text style={styles.meta}>
                ${spend.toFixed(2)} used of ${limit!.toFixed(2)} this period
              </Text>
            </>
          ) : null}
        </Card>
      ) : null}

      {!canEdit && error ? <Text style={styles.error}>{error}</Text> : null}

      {flags.channelDelete ? (
        <Pressable style={styles.delete} onPress={() => setDeleteOpen(true)} accessibilityRole="button">
          <Feather name="trash-2" size={18} color={color.danger} />
          <Text style={styles.deleteText}>Delete channel</Text>
        </Pressable>
      ) : null}

      <OptionSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Default voice"
        options={VOICES}
        selected={(voice as (typeof VOICES)[number]['value'] | null) ?? 'alloy'}
        onSelect={(v) => v && set({ defaultVoice: v })}
      />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        icon="alert-triangle"
        title="Discard changes?"
        body="Your unsaved edits to this channel will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          router.back();
        }}
      />
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
  inputInvalid: { borderColor: color.danger },
  multiline: { minHeight: 90, maxHeight: 200, textAlignVertical: 'top' },
  styleGuide: { minHeight: 120, maxHeight: 240 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: color.future,
    borderRadius: radius.lg,
  },
  rowText: { flex: 1 },
  rowCaption: { ...type.meta, fontSize: 12 },
  rowValue: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  moneyInput: { flex: 1, ...type.body, color: color.ink, padding: 0 },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: color.accent },
  youtubeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  error: { ...type.meta, color: color.danger },
  saved: { ...type.meta, color: color.okText },
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

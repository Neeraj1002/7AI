import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Switch, BackHandler, Image, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import { useTRPC, useTRPCClient } from '../../../lib/trpc';
import { useAuth } from '../../../lib/auth';
import { useChannels } from '../../../lib/channel-context';
import { flags } from '../../../lib/feature-flags';
import { useOptionLists } from '../../../lib/pipeline-options';
import { useAuthedImageSource } from '../../../lib/use-authed-image-source';
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
// Every field channels.update accepts, minus channelId — the draft only ever
// holds real API fields now (task 5/R1: the previous PendingFields type and
// its casts read fields the backend never returned).
type Draft = Partial<Omit<UpdateInput, 'channelId'>>;

const SPEND_PATTERN = /^\d+(\.\d{1,2})?$/;
const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Private' },
  { value: 'unlisted' as const, label: 'Unlisted' },
  { value: 'public' as const, label: 'Public' },
];

export default function ChannelSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { apiUrl, token } = useAuth();
  const { channelById, channelIndex } = useChannels();
  const channel = channelById(id);
  const index = channelIndex(id);

  const operational = useQuery(trpc.dashboard.operational.queryOptions({ channelId: id }));
  const cost = useQuery(trpc.dashboard.cost.queryOptions({ channelId: id }));

  const [barHeight, setBarHeight] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [spendText, setSpendText] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [watermarkBusy, setWatermarkBusy] = useState(false);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Task 4/E7 — live from options.list (B9), falling back to pipeline-options.ts.
  const { voices: liveVoices } = useOptionLists();

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });
  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));

  // Backend: budgetOverrideUsd is a NUMERIC column returned as a string (or
  // null); the update input takes a real number. Parse before comparing so
  // "changed fields only" compares like with like.
  const savedBudget = channel?.budgetOverrideUsd != null ? Number(channel.budgetOverrideUsd) : null;
  const spendInvalid =
    spendText !== null && spendText.trim() !== '' && (!SPEND_PATTERN.test(spendText.trim()) || Number(spendText) <= 0);

  const changes: Draft = { ...draft };
  if (spendText !== null && !spendInvalid) {
    const next = spendText.trim() === '' ? null : Number(spendText);
    if (next !== savedBudget) changes.budgetOverrideUsd = next;
  }
  if (draft.styleGuide !== undefined) {
    // Backend stores '' as null — send null to clear, not an empty string.
    const nextStyleGuide = !draft.styleGuide || draft.styleGuide.trim() === '' ? null : draft.styleGuide;
    if (nextStyleGuide !== (channel?.styleGuide ?? null)) changes.styleGuide = nextStyleGuide;
    else delete changes.styleGuide;
  }
  if (channel) {
    if (changes.name === channel.name) delete changes.name;
    if (changes.nicheDescription === channel.nicheDescription) delete changes.nicheDescription;
    if (changes.defaultVoice === (channel.defaultVoice ?? undefined)) delete changes.defaultVoice;
    if (changes.captionsEnabled === (channel.brandAssets.captionsEnabled ?? true)) delete changes.captionsEnabled;
    if (changes.defaultPrivacyStatus === channel.defaultPrivacyStatus) delete changes.defaultPrivacyStatus;
    if (changes.gate1Enabled === channel.approvalGateConfig.gate1Enabled) delete changes.gate1Enabled;
    if (changes.gate2Enabled === channel.approvalGateConfig.gate2Enabled) delete changes.gate2Enabled;
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
    mutationFn: () => trpcClient.channels.update.mutate({ channelId: id!, ...changes }),
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
    // Keeps the edits in place (per spec) so a BAD_REQUEST from the server's
    // gate2/visibility invariant doesn't lose what was typed.
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

  // Rules of hooks — must run before the not-found return below, regardless
  // of whether a watermark is actually set.
  const watermarkPath = channel?.brandAssets.watermarkUrl;
  const watermarkImage = useAuthedImageSource(
    watermarkPath ? `${apiUrl}/channels/${channel!.id}/watermark` : null,
    token ?? '',
  );

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

  // Fix 5 (task 4/E8) — a plain REST round trip, same reasoning
  // watermark-route.ts's own comment gives: binary content doesn't fit
  // tRPC's JSON-RPC shape. PNG only, per the locked board.
  const handlePickWatermark = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.mimeType && asset.mimeType !== 'image/png') {
      setWatermarkError('Only PNG images are accepted.');
      return;
    }
    setWatermarkBusy(true);
    setWatermarkError(null);
    try {
      const form = new FormData();
      // asset.file (web only) is a real File the browser's fetch/FormData
      // already knows how to send; native RN's FormData instead wants the
      // {uri,name,type} object shape.
      if (asset.file) {
        form.append('file', asset.file);
      } else {
        form.append('file', {
          uri: asset.uri,
          name: asset.fileName ?? 'watermark.png',
          type: asset.mimeType ?? 'image/png',
        } as unknown as Blob);
      }
      const res = await fetch(`${apiUrl}/channels/${channel.id}/watermark`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to upload watermark.');
      await invalidateChannels();
    } catch (err) {
      setWatermarkError(err instanceof Error ? err.message : 'Failed to upload watermark.');
    } finally {
      setWatermarkBusy(false);
    }
  };

  const handleRemoveWatermark = async () => {
    setWatermarkBusy(true);
    setWatermarkError(null);
    try {
      const res = await fetch(`${apiUrl}/channels/${channel.id}/watermark`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to remove watermark.');
      }
      await invalidateChannels();
    } catch (err) {
      setWatermarkError(err instanceof Error ? err.message : 'Failed to remove watermark.');
    } finally {
      setWatermarkBusy(false);
    }
  };

  // stageFunnel buckets EVERY run (terminal or not) by its current stage, so
  // summing every bucket is the real total run count (R7).
  const runs = operational.data?.stageFunnel.reduce((sum, row) => sum + row.count, 0);
  const published = cost.data?.costPerPublishedVideo.publishedCount;
  const spend = cost.data?.totalSpendUsd;
  const metaParts = [
    runs !== undefined ? `${runs} runs` : null,
    published !== undefined ? `${published} published` : null,
    spend !== undefined ? `$${spend.toFixed(2)} spent` : null,
  ].filter(Boolean);

  const name = draft.name ?? channel.name;
  const niche = draft.nicheDescription ?? channel.nicheDescription;
  const styleGuideText = draft.styleGuide ?? channel.styleGuide ?? '';
  const voice = draft.defaultVoice ?? channel.defaultVoice ?? null;
  const captions = draft.captionsEnabled ?? channel.brandAssets.captionsEnabled ?? true;
  const visibility: Privacy = draft.defaultPrivacyStatus ?? channel.defaultPrivacyStatus;
  const gate1 = draft.gate1Enabled ?? channel.approvalGateConfig.gate1Enabled;
  const gate2 = draft.gate2Enabled ?? channel.approvalGateConfig.gate2Enabled;
  const limit = spendText !== null ? (spendText.trim() === '' ? null : Number(spendText)) : savedBudget;
  const limitValid = limit !== null && !Number.isNaN(limit) && limit > 0;

  // B7 as built: the server rejects gate2Enabled:false unless
  // defaultPrivacyStatus is 'private', and rejects leaving 'private' while
  // Gate 2 is off. Mirror both directions in the UI so a doomed request is
  // never even sent.
  const gate2SwitchDisabled = visibility !== 'private';
  const visibilityRestrictedToPrivate = !gate2;

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
          <TextInput
            selectionColor={color.accent}
            cursorColor={color.accent}
            style={styles.input}
            value={name}
            onChangeText={(v) => set({ name: v })}
          />
        ) : (
          <Text style={styles.body}>{channel.name}</Text>
        )}
        <Text style={styles.label}>Niche description</Text>
        {flags.channelEdit ? (
          <>
            <TextInput
              selectionColor={color.accent}
              cursorColor={color.accent}
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
              selectionColor={color.accent}
              cursorColor={color.accent}
              style={[styles.input, styles.multiline, styles.styleGuide]}
              value={styleGuideText}
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
              <Text style={styles.rowValue}>{liveVoices.find((v) => v.value === voice)?.label ?? 'Alloy'}</Text>
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
          {flags.watermarkUpload ? (
            <View style={styles.watermarkSection}>
              <Text style={styles.label}>Watermark</Text>
              {watermarkPath ? (
                <View style={styles.watermarkRow}>
                  {watermarkImage ? (
                    <Image source={watermarkImage} style={styles.watermarkThumb} resizeMode="contain" />
                  ) : (
                    <View style={[styles.watermarkThumb, styles.watermarkThumbLoading]}>
                      <ActivityIndicator size="small" color={color.muted} />
                    </View>
                  )}
                  <View style={styles.watermarkActions}>
                    <SecondaryButton
                      label="Replace"
                      icon="upload"
                      onPress={handlePickWatermark}
                      loading={watermarkBusy}
                      disabled={watermarkBusy}
                    />
                    <SecondaryButton
                      label="Remove"
                      icon="trash-2"
                      onPress={handleRemoveWatermark}
                      loading={watermarkBusy}
                      disabled={watermarkBusy}
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.watermarkUpload}
                  onPress={handlePickWatermark}
                  disabled={watermarkBusy}
                  accessibilityRole="button"
                >
                  {watermarkBusy ? (
                    <ActivityIndicator size="small" color={color.ink} />
                  ) : (
                    <>
                      <Feather name="upload" size={18} color={color.ink} />
                      <Text style={styles.watermarkUploadText}>Upload logo</Text>
                    </>
                  )}
                </Pressable>
              )}
              {watermarkError ? <Text style={styles.error}>{watermarkError}</Text> : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Publishing</Text>
        {showPublishingVisibility ? (
          <>
            <Text style={styles.label}>Default visibility</Text>
            <SegmentedControl
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={(v) => set({ defaultPrivacyStatus: v })}
              disabledValues={visibilityRestrictedToPrivate ? (['unlisted', 'public'] as const) : undefined}
            />
            {visibilityRestrictedToPrivate ? (
              <Text style={styles.meta}>Turn Gate 2 back on to change this.</Text>
            ) : null}
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
              <Text style={styles.meta}>
                Off: scripts that pass review (7+/10) go straight to video. A script that still fails after
                3 retries waits for you.
              </Text>
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
              <Text style={styles.meta}>
                {gate2SwitchDisabled
                  ? 'Set default visibility to Private to turn this off.'
                  : 'Off: videos that pass review publish automatically as Private.'}
              </Text>
            </View>
            <Switch
              value={gate2}
              onValueChange={(v) => set({ gate2Enabled: v })}
              disabled={gate2SwitchDisabled}
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
              selectionColor={color.accent}
              cursorColor={color.accent}
              style={styles.moneyInput}
              value={spendText ?? (savedBudget != null ? String(savedBudget) : '')}
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
        options={liveVoices}
        selected={voice ?? 'alloy'}
        // Cast: options.list (E7) returns arbitrary strings; the server's own
        // zod enum is still the real validation for whatever's actually sent.
        onSelect={(v) => v && set({ defaultVoice: v as never })}
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
  watermarkSection: { gap: space.sm },
  watermarkUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
  },
  watermarkUploadText: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  watermarkThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.surface2 },
  watermarkThumbLoading: { alignItems: 'center', justifyContent: 'center' },
  watermarkActions: { flexDirection: 'row', gap: space.sm, flex: 1 },
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

import React, { useEffect, useState } from 'react';
import { youtubeNeedsReconnect } from '../../lib/server-extras';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useTRPC, useTRPCClient } from '../../lib/trpc';
import { useChannels } from '../../lib/channel-context';
import { color, font, radius, space, type } from '../../lib/theme';
import { FormScreen } from '../../components/FormScreen';
import { ChannelAvatar } from '../../components/ChannelAvatar';
import { ChannelPickerSheet } from '../../components/ChannelPickerSheet';
import { PrimaryButton } from '../../components/Buttons';
import { OptionSheet } from '../../components/OptionSheet';
import { FormatSheet } from '../../components/FormatSheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { flags } from '../../lib/feature-flags';
import { LENGTHS, useOptionLists } from '../../lib/pipeline-options';
import { MAX_SOURCES, chipFormatKeys, validateSources } from '../../lib/brief-extras';

// Task 6/E4 "Edit brief & run again" pre-fills these from an ended run's own
// briefText/channelId/creationOptions — read once on mount, matched against
// the known option lists so a value the server sends that this app doesn't
// recognize is silently ignored rather than crashing the picker sheets.
type PrefillParams = {
  channelId?: string;
  briefText?: string;
  voice?: string;
  visualSource?: string;
  audioLayer?: string;
  targetDurationSec?: string;
};

export default function NewBriefScreen() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const params = useLocalSearchParams<PrefillParams>();
  const {
    channels,
    isLoading: channelsLoading,
    selectedChannelId,
    setSelectedChannelId,
    isLastUsed,
    channelIndex,
    channelById,
  } = useChannels();
  const [briefText, setBriefText] = useState(params.briefText ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [length, setLength] = useState<(typeof LENGTHS)[number] | 'auto'>(() => {
    const n = Number(params.targetDurationSec);
    return LENGTHS.includes(n as (typeof LENGTHS)[number]) ? (n as (typeof LENGTHS)[number]) : 'auto';
  });
  const [visual, setVisual] = useState<string | 'auto'>(params.visualSource ?? 'auto');
  const [voice, setVoice] = useState<string | null>(params.voice ?? null);
  const [music, setMusic] = useState<string | null>(params.audioLayer ?? null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  // Sprint 4 FE E3 (sources) and E4 (format). Freeform = no format; `formatKey` is only ever sent when one is picked.
  const [sources, setSources] = useState<string[]>([]);
  const [formatKey, setFormatKey] = useState<string | null>(null);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const formatsQuery = useQuery(trpc.channels.listFormats.queryOptions());
  const comparisonQuery = useQuery(trpc.dashboard.comparison.queryOptions());
  // Task 4/E7 — live from options.list (B9), falling back to the static
  // lists in pipeline-options.ts while it loads or on error.
  const { voices: VOICES, visualSources: VISUAL_SOURCES, moodTags: MUSIC_MOODS } = useOptionLists();

  useEffect(() => {
    if (params.channelId) setSelectedChannelId(params.channelId);
    // Only ever applies the deep-link's channel once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = channelById(selectedChannelId);
  const formats = formatsQuery.data ?? [];
  const format = formats.find((f) => f.key === formatKey);
  const chipKeys = chipFormatKeys(
    formats,
    comparisonQuery.data?.channels.find((c) => c.channelId === selectedChannelId),
    formatKey,
  );
  // Bugs Task 8 (R1) — runs.create refuses an unlinked channel; say so up front.
  const needsYoutube = selected !== undefined && !selected.hasYoutubeCredential;
  // R13: the credential exists but Google rejected it; the run would fail at upload, so say so up front (not blocked).
  const needsReconnect = selected !== undefined && selected.hasYoutubeCredential && youtubeNeedsReconnect(selected);
  const channelVoice = selected?.defaultVoice;
  const channelVoiceLabel = VOICES.find((v) => v.value === channelVoice)?.label ?? 'Alloy';
  const voiceLabel = voice ? VOICES.find((v) => v.value === voice)!.label : `Channel default (${channelVoiceLabel})`;
  const musicLabel = music ? MUSIC_MOODS.find((m) => m.value === music)!.label : 'Auto (let the pipeline pick)';

  const createRun = useMutation(
    trpc.runs.create.mutationOptions({
      onSuccess: async (run) => {
        await queryClient.invalidateQueries({ queryKey: trpc.runs.list.queryKey() });
        router.replace(`/run/${run.id}`);
      },
      onError: (err) => setError(err.message),
    }),
  );

  const invalidateChannels = () => queryClient.invalidateQueries({ queryKey: trpc.channels.list.queryKey() });

  // Task 4/E5 — same connect flow as Channel detail, run inline so the user
  // stays on New brief instead of bouncing to Channel detail and back.
  const handleConnect = async () => {
    if (!selectedChannelId) return;
    setConnectError(null);
    setConnecting(true);
    try {
      const { authUrl } = await trpcClient.channels.getYoutubeConnectUrl.query({ channelId: selectedChannelId });
      await WebBrowser.openAuthSessionAsync(authUrl);
      await invalidateChannels();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start the connect flow.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSubmit = () => {
    setError(null);
    if (!selectedChannelId) {
      setError('Pick a channel first.');
      return;
    }
    if (needsYoutube) {
      setError(`Connect ${selected?.name ?? 'this channel'} to YouTube before starting a run.`);
      return;
    }
    if (!briefText.trim()) {
      setError('Brief text is required.');
      return;
    }
    // Only non-default picks are sent, so channel defaults and the planner
    // keep working. Cast: voice/visual/music now come from options.list
    // (E7, arbitrary strings) rather than a literal union — the server's own
    // zod enums are still the real validation, this just satisfies the
    // client's stricter input type for a value that only ever actually
    // originates from that same server list or its static fallback.
    const checked = validateSources(sources);
    if (checked.error) {
      setError(checked.error);
      return;
    }
    createRun.mutate({
      channelId: selectedChannelId,
      briefText: briefText.trim(),
      ...(checked.sources.length > 0 ? { sources: checked.sources } : {}),
      ...(format ? { formatKey: format.key as never } : {}),
      ...(voice ? { voice: voice as never } : {}),
      ...(visual !== 'auto' ? { visualSource: visual as never } : {}),
      ...(music ? { audioLayer: music as never } : {}),
      ...(!format && flags.briefLength && length !== 'auto' ? ({ targetDurationSec: length } as object) : {}),
    });
  };

  return (
    <FormScreen variant="stack" title="New brief" contentContainerStyle={styles.content}>
      <Text style={styles.label}>Channel</Text>
      {channelsLoading ? (
        <ActivityIndicator />
      ) : channels.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No channels set up yet.</Text>
          <Pressable onPress={() => router.push('/channels')}>
            <Text style={styles.emptyLink}>Set up a channel →</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Pressable
            style={[styles.channelField, needsYoutube && styles.channelFieldWarned]}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
          >
            <ChannelAvatar index={channelIndex(selectedChannelId)} size={40} />
            <View style={styles.channelText}>
              <Text style={styles.channelName} numberOfLines={1}>
                {selected?.name ?? 'Select channel'}
              </Text>
              {isLastUsed ? <Text style={styles.channelMeta}>Last used · tap to change</Text> : null}
            </View>
            <Feather name="chevron-down" size={20} color={color.muted} />
          </Pressable>
          {needsYoutube ? (
            <View style={styles.warnStrip}>
              <Feather name="link" size={16} color={color.warnText} />
              <Text style={styles.warnStripText}>Not connected to YouTube. Runs need a connected channel.</Text>
              <Pressable style={styles.connectButton} onPress={handleConnect} disabled={connecting} accessibilityRole="button">
                {connecting ? (
                  <ActivityIndicator size="small" color={color.onAccent} />
                ) : (
                  <Text style={styles.connectButtonText}>Connect</Text>
                )}
              </Pressable>
            </View>
          ) : null}
          {connectError ? <Text style={styles.error}>{connectError}</Text> : null}
        </View>
      )}

      <Text style={styles.label}>Format</Text>
      <View style={styles.chipRow}>
        <FormatChip label="Freeform" active={formatKey === null} onPress={() => setFormatKey(null)} />
        {chipKeys.map((k) => (
          <FormatChip
            key={k}
            label={formats.find((f) => f.key === k)?.label ?? k}
            active={formatKey === k}
            onPress={() => setFormatKey(k)}
          />
        ))}
        {formats.length > 0 ? (
          <FormatChip label="More formats ▾" active={false} onPress={() => setFormatsOpen(true)} />
        ) : null}
      </View>
      <Text style={styles.tip}>
        {format ? format.scriptStructure : 'Freeform is the default — nothing changes unless you pick a format.'}
      </Text>

      <Text style={styles.label}>What&apos;s the short about?</Text>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={[styles.input, focused && styles.inputFocused]}
        value={briefText}
        onChangeText={setBriefText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={format?.briefTemplate ?? 'Topic, angle and length — e.g. "30 sec on why octopuses have three hearts"'}
        placeholderTextColor={color.muted}
        multiline
        scrollEnabled
      />
      <Text style={styles.tip}>Tip: the more specific the angle, the better the script.</Text>

      <Text style={styles.label}>
        Sources <Text style={styles.optionalNote}>· optional</Text>
      </Text>
      {sources.map((src, i) => (
        <View key={i} style={styles.sourceRow}>
          <Feather name="link" size={16} color={color.muted} />
          <TextInput
            style={styles.sourceInput}
            value={src}
            onChangeText={(t) => setSources((prev) => prev.map((v, j) => (j === i ? t : v)))}
            placeholder="https://…"
            placeholderTextColor={color.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            selectionColor={color.accent}
            cursorColor={color.accent}
          />
          <Pressable
            onPress={() => setSources((prev) => prev.filter((_, j) => j !== i))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove source ${i + 1}`}
          >
            <Feather name="x" size={20} color={color.muted} />
          </Pressable>
        </View>
      ))}
      {sources.length < MAX_SOURCES ? (
        <Pressable onPress={() => setSources((prev) => [...prev, ''])} accessibilityRole="button">
          <Text style={styles.addSource}>+ Add a source link</Text>
        </Pressable>
      ) : null}
      <Text style={styles.tip}>Shown to you at Gate 1 and credited in the video description.</Text>

      <View style={styles.optionsHeader}>
        <Text style={styles.optionsTitle}>Options</Text>
        <Text style={styles.tip}>
          {needsYoutube
            ? 'Available once connected'
            : format
              ? `Length: ${format.targetSeconds}s (from format)`
              : 'Channel defaults unless changed'}
        </Text>
      </View>
      <View style={needsYoutube ? styles.optionsDimmed : undefined} pointerEvents={needsYoutube ? 'none' : 'auto'}>
        {!format && flags.briefLength ? (
          <>
            <Text style={styles.label}>Length</Text>
            <SegmentedControl
              options={[...LENGTHS.map((l) => ({ value: l, label: `${l}s` })), { value: 'auto' as const, label: 'Auto' }]}
              value={length}
              onChange={setLength}
            />
          </>
        ) : null}
        <Text style={styles.label}>Visuals</Text>
        <SegmentedControl
          options={[{ value: 'auto' as const, label: 'Auto' }, ...VISUAL_SOURCES]}
          value={visual}
          onChange={setVisual}
        />
        <Pressable style={styles.optionRow} onPress={() => setVoiceOpen(true)} accessibilityRole="button">
          <Feather name="mic" size={20} color={color.muted} />
          <View style={styles.channelText}>
            <Text style={styles.channelMeta}>Voice</Text>
            <Text style={styles.channelName} numberOfLines={1}>{voiceLabel}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={color.muted} />
        </Pressable>
        <Pressable style={styles.optionRow} onPress={() => setMusicOpen(true)} accessibilityRole="button">
          <Feather name="music" size={20} color={color.muted} />
          <View style={styles.channelText}>
            <Text style={styles.channelMeta}>Background music</Text>
            <Text style={styles.channelName} numberOfLines={1}>{musicLabel}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={color.muted} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label="Create run"
        onPress={handleSubmit}
        loading={createRun.isPending}
        disabled={needsYoutube}
        style={needsYoutube ? styles.createRunDisabled : undefined}
      />
      {needsYoutube ? (
        <Text style={styles.tip}>Connect YouTube or pick another channel to continue.</Text>
      ) : null}
      {needsReconnect ? (
        <Text style={styles.tip}>This channel&apos;s YouTube connection expired. Reconnect it in Channel settings before the run reaches upload.</Text>
      ) : null}

      <FormatSheet
        visible={formatsOpen}
        onClose={() => setFormatsOpen(false)}
        formats={formats}
        selected={formatKey}
        onSelect={setFormatKey}
      />
      <OptionSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Voice"
        options={[{ value: null, label: `Channel default (${channelVoiceLabel})` }, ...VOICES]}
        selected={voice}
        onSelect={setVoice}
      />
      <OptionSheet
        visible={musicOpen}
        onClose={() => setMusicOpen(false)}
        title="Background music"
        options={[{ value: null, label: 'Auto (let the pipeline pick)' }, ...MUSIC_MOODS]}
        selected={music}
        onSelect={setMusic}
      />
      <ChannelPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="select"
        selectedId={selectedChannelId}
        onSelect={(id) => {
          if (!id) return;
          setSelectedChannelId(id);
          setVoice(null);
          setVisual('auto');
          setMusic(null);
          setLength('auto');
        }}
      />
    </FormScreen>
  );
}

function FormatChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    height: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: color.future,
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  chipTextActive: { color: color.onAccent, fontFamily: font.black },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.future,
  },
  sourceInput: { flex: 1, paddingVertical: 10, fontFamily: font.regular, fontSize: 13, color: color.ink },
  optionalNote: { fontFamily: font.regular, color: color.muted },
  addSource: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  content: { padding: space.lg, gap: space.sm },
  label: { fontFamily: font.bold, fontSize: 14, color: color.ink, marginTop: space.sm },
  channelField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderRadius: radius.lg,
  },
  channelFieldWarned: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  warnStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.warnBg,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: color.ink,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  warnStripText: { ...type.meta, color: color.warnText, flex: 1 },
  connectButton: {
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: { fontFamily: font.bold, fontSize: 13, color: color.onAccent },
  optionsDimmed: { opacity: 0.4 },
  createRunDisabled: { backgroundColor: color.surface2 },
  channelText: { flex: 1 },
  channelName: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  channelMeta: { ...type.meta, fontSize: 12 },
  empty: { gap: 4 },
  emptyText: { ...type.meta },
  emptyLink: { fontFamily: font.bold, fontSize: 14, color: color.accentText, textDecorationLine: 'underline' },
  input: {
    minHeight: 168,
    maxHeight: 320,
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    padding: space.md,
    textAlignVertical: 'top',
    ...type.body,
    color: color.ink,
  },
  inputFocused: { borderColor: color.accent },
  tip: { ...type.meta, fontSize: 12 },
  optionsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  optionsTitle: { fontFamily: font.black, fontSize: 15, color: color.ink },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: color.future,
    borderRadius: radius.lg,
  },
  error: { ...type.body, color: color.danger },
});

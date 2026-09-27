import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useTRPC } from '../../lib/trpc';
import { useChannels } from '../../lib/channel-context';
import { color, font, radius, space, type } from '../../lib/theme';
import { FormScreen } from '../../components/FormScreen';
import { ChannelAvatar } from '../../components/ChannelAvatar';
import { ChannelPickerSheet } from '../../components/ChannelPickerSheet';
import { PrimaryButton } from '../../components/Buttons';
import { OptionSheet } from '../../components/OptionSheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { flags } from '../../lib/feature-flags';
import { LENGTHS, MUSIC_MOODS, VISUAL_SOURCES, VOICES } from '../../lib/pipeline-options';

export default function NewBriefScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    channels,
    isLoading: channelsLoading,
    selectedChannelId,
    setSelectedChannelId,
    isLastUsed,
    channelIndex,
    channelById,
  } = useChannels();
  const [briefText, setBriefText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [length, setLength] = useState<(typeof LENGTHS)[number] | 'auto'>('auto');
  const [visual, setVisual] = useState<(typeof VISUAL_SOURCES)[number]['value'] | 'auto'>('auto');
  const [voice, setVoice] = useState<(typeof VOICES)[number]['value'] | null>(null);
  const [music, setMusic] = useState<(typeof MUSIC_MOODS)[number]['value'] | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);

  const selected = channelById(selectedChannelId);
  // Bugs Task 8 (R1) — runs.create refuses an unlinked channel; say so up front.
  const needsYoutube = selected !== undefined && !selected.hasYoutubeCredential;
  const channelVoice = (selected as { defaultVoice?: string | null } | undefined)?.defaultVoice;
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
    // Only non-default picks are sent, so channel defaults and the planner keep working.
    createRun.mutate({
      channelId: selectedChannelId,
      briefText: briefText.trim(),
      ...(voice ? { voice } : {}),
      ...(visual !== 'auto' ? { visualSource: visual } : {}),
      ...(music ? { audioLayer: music } : {}),
      ...(flags.briefLength && length !== 'auto' ? ({ targetDurationSec: length } as object) : {}),
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
        <Pressable style={styles.channelField} onPress={() => setPickerOpen(true)} accessibilityRole="button">
          <ChannelAvatar index={channelIndex(selectedChannelId)} size={40} />
          <View style={styles.channelText}>
            <Text style={styles.channelName} numberOfLines={1}>
              {selected?.name ?? 'Select channel'}
            </Text>
            {isLastUsed ? <Text style={styles.channelMeta}>Last used · tap to change</Text> : null}
          </View>
          <Feather name="chevron-down" size={20} color={color.muted} />
        </Pressable>
      )}
      {needsYoutube ? (
        <Pressable onPress={() => router.push(`/channel/${selectedChannelId}`)} accessibilityRole="link">
          <Text style={styles.error}>This channel isn&apos;t connected to YouTube yet. Connect it →</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>What&apos;s the short about?</Text>
      <TextInput
        style={[styles.input, focused && styles.inputFocused]}
        value={briefText}
        onChangeText={setBriefText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={'Topic, angle and length — e.g. "30 sec on why octopuses have three hearts"'}
        placeholderTextColor={color.muted}
        multiline
        scrollEnabled
      />
      <Text style={styles.tip}>Tip: the more specific the angle, the better the script.</Text>

      <View style={styles.optionsHeader}>
        <Text style={styles.optionsTitle}>Options</Text>
        <Text style={styles.tip}>Channel defaults unless changed</Text>
      </View>
      {flags.briefLength ? (
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label="Create run"
        onPress={handleSubmit}
        loading={createRun.isPending}
        disabled={needsYoutube}
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

const styles = StyleSheet.create({
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

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

  const selected = channelById(selectedChannelId);

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
    if (!briefText.trim()) {
      setError('Brief text is required.');
      return;
    }
    createRun.mutate({ channelId: selectedChannelId, briefText: briefText.trim() });
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton label="Create run" onPress={handleSubmit} loading={createRun.isPending} />

      <ChannelPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="select"
        selectedId={selectedChannelId}
        onSelect={(id) => id && setSelectedChannelId(id)}
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
  error: { ...type.body, color: color.danger },
});

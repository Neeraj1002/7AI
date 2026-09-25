import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
import { useChannels } from '../../lib/channel-context';

// New Brief screen — MOBILE_APP_DESIGN.md Section 4. Backend-side this is
// genuinely new (per BUSINESS_LOGIC.md): before Task 1, the only way to
// start a PipelineRun was scripts/dry-run.ts from a terminal.
export default function NewBriefScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Bugs Task 1/R4 — channelsLoading was already exposed by useChannels()
  // but never read here, so a loading channel list and a genuinely empty
  // one both rendered as the same silent blank space. Now branched below.
  const { channels, isLoading: channelsLoading, selectedChannelId, setSelectedChannelId } = useChannels();
  const [briefText, setBriefText] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Channel</Text>
      {channelsLoading ? (
        <ActivityIndicator />
      ) : channels.length === 0 ? (
        <View style={styles.channelEmpty}>
          <Text style={styles.channelEmptyText}>No channels set up yet.</Text>
          <Pressable onPress={() => router.push('/channels')}>
            <Text style={styles.channelEmptyLink}>Set up a channel →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.channelList}>
          {channels.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.channelChip, c.id === selectedChannelId && styles.channelChipSelected]}
              onPress={() => setSelectedChannelId(c.id)}
            >
              <Text
                style={c.id === selectedChannelId ? styles.channelChipTextSelected : styles.channelChipText}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Brief</Text>
      <TextInput
        style={styles.textArea}
        value={briefText}
        onChangeText={setBriefText}
        placeholder="A short video about..."
        multiline
        numberOfLines={6}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, createRun.isPending && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={createRun.isPending}
      >
        {createRun.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Run</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  channelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channelChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  channelChipSelected: { backgroundColor: '#111', borderColor: '#111' },
  channelChipText: { fontSize: 13 },
  channelChipTextSelected: { fontSize: 13, color: '#fff', fontWeight: '600' },
  channelEmpty: { gap: 4 },
  channelEmptyText: { fontSize: 13, color: '#666' },
  channelEmptyLink: { fontSize: 13, color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  textArea: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  error: { color: '#c00', marginTop: 8 },
  button: {
    marginTop: 20,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

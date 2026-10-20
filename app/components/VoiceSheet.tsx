import React, { useState } from 'react';
import { Text, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { BottomSheet } from './BottomSheet';
import { useAuth } from '../lib/auth';
import { color, font, radius, space, type } from '../lib/theme';
import { nextPlayback, sampleId, useVoiceCatalog, type VoiceEntry } from '../lib/voice-catalog';

// Sprint 5 Task 7 R6 — the voice picker: each enabled voice with its name, tone tags and a play/pause button that streams
// its stored sample (one at a time); the selected voice is marked; no provider ids appear. Replaces the name-only list on
// run setup and channel settings. expo-video plays the audio file, so no new native module is needed.
export function VoiceSheet({
  visible,
  onClose,
  title,
  defaultLabel,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Label of the "no choice, use the default" row, or undefined when there is no such row. */
  defaultLabel?: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { voices, hasSamples } = useVoiceCatalog();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible ? (
        <VoiceList title={title} defaultLabel={defaultLabel} voices={voices} hasSamples={hasSamples} selected={selected} onSelect={onSelect} onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

function VoiceList({
  title,
  defaultLabel,
  voices,
  hasSamples,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  defaultLabel?: string;
  voices: VoiceEntry[];
  hasSamples: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const { token, apiUrl } = useAuth();
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Each voice has two samples, a sad line and a hopeful line; one plays at a time.
  const toggle = async (url: string, id: string) => {
    const action = nextPlayback(isPlaying ? playingId : null, id);
    if (action === 'pause') {
      player.pause();
      return;
    }
    // A sample served by our own API needs the sign-in header; a signed storage link must not get it.
    const own = apiUrl ? url.startsWith(apiUrl.replace(/\/$/, '')) : false;
    await player.replaceAsync(own && token ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : { uri: url });
    setPlayingId(id);
    player.play();
  };

  const choose = (id: string | null) => {
    player.pause();
    onSelect(id);
    onClose();
  };

  return (
    <>
      <Text style={styles.title}>{title}</Text>
      {!hasSamples ? <Text style={styles.note}>Voice samples aren&apos;t available yet.</Text> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {defaultLabel ? <Row label={defaultLabel} active={selected === null} onChoose={() => choose(null)} /> : null}
        {voices.map((v) => (
          <Row
            key={v.id}
            label={v.displayName}
            tags={v.toneTags}
            description={v.description}
            active={v.id === selected}
            onChoose={() => choose(v.id)}
            samples={(['sad', 'hopeful'] as const).map((which) => ({
              label: which === 'sad' ? 'Sad line' : 'Hopeful line',
              available: v.previews !== null,
              playing: isPlaying && playingId === sampleId(v.id, which),
              onToggle: () => v.previews && void toggle(v.previews[which], sampleId(v.id, which)),
            }))}
          />
        ))}
      </ScrollView>
    </>
  );
}

type Sample = { label: string; available: boolean; playing: boolean; onToggle: () => void };

function Row({
  label,
  tags,
  description,
  active,
  onChoose,
  samples,
}: {
  label: string;
  tags?: string[];
  description?: string | null;
  active: boolean;
  onChoose: () => void;
  samples?: Sample[];
}) {
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <View style={styles.text}>
        <Pressable onPress={onChoose} accessibilityRole="radio" accessibilityState={{ selected: active }} style={styles.pick}>
          <Text style={styles.label}>{label}</Text>
          {tags && tags.length > 0 ? <Text style={styles.caption}>{tags.join(' · ')}</Text> : null}
          {description ? <Text style={styles.caption}>{description}</Text> : null}
        </Pressable>
        {samples ? (
          <View style={styles.samples}>
            {samples.map((smp) => (
              <Pressable
                key={smp.label}
                onPress={smp.onToggle}
                disabled={!smp.available}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={smp.available ? `${smp.playing ? 'Pause' : 'Play'} the ${smp.label.toLowerCase()} by ${label}` : `No sample for ${label} yet`}
                style={[styles.play, !smp.available && styles.playOff]}
              >
                <Feather name={smp.playing ? 'pause' : 'play'} size={14} color={smp.available ? color.onAccent : color.muted} />
                <Text style={[styles.playText, !smp.available && styles.playTextOff]}>{smp.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Pressable onPress={onChoose} hitSlop={8} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.radio, active && styles.radioActive]}>
        {active ? <Feather name="check" size={14} color={color.onAccent} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.stackTitle, color: color.ink },
  note: { ...type.meta, fontSize: 12 },
  list: { maxHeight: 460 },
  listContent: { gap: space.xs },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  rowActive: { backgroundColor: color.accentSoft },
  play: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color.ink },
  playOff: { backgroundColor: color.surface2 },
  playText: { fontFamily: font.bold, fontSize: 12, color: color.onAccent },
  playTextOff: { color: color.muted },
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pick: { gap: 2, minHeight: 44, justifyContent: 'center' },
  text: { flex: 1, gap: 6, justifyContent: 'center' },
  label: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  caption: { ...type.meta, fontSize: 12 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: color.accent, borderColor: color.accent },
});

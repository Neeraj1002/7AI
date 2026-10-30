import React, { useEffect, useState } from 'react';
import { Text, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useVideoPlayer } from 'expo-video';
import { useEvent, useEventListener } from 'expo';
import { PrimaryButton } from './Buttons';
import { useAuth } from '../lib/auth';
import { color, font, radius, space, type } from '../lib/theme';
import { nextPlayback, pauseQuietly, sampleButtonText, sampleId, useVoiceCatalog } from '../lib/voice-catalog';

// The voice list as a page (follow-up R1), not a modal: it sits inside whatever sheet shows it. Each voice has a radio,
// its name, tone tags and a "▶ Sad" and a "▶ Hopeful" button streaming a stored sample; the playing button turns black with
// "■ … 0:04", only one plays at a time, and a sample that fails reads "Sample unavailable" while the voice can still be
// chosen. The bottom button is "Use {voice}". expo-video plays the audio file, so no extra native module is needed.
export function VoicePicker({
  title,
  backLabel,
  onBack,
  defaultLabel,
  selected,
  onUse,
}: {
  title: string;
  /** Text of the back link ("Edit settings"); with `onBack` the page shows "‹ {backLabel}". */
  backLabel?: string;
  onBack?: () => void;
  /** Label of the "no choice, use the default" row, or undefined when there is no such row. */
  defaultLabel?: string;
  selected: string | null;
  /** The chosen voice id, or null for the default. The caller leaves the page. */
  onUse: (id: string | null) => void;
}) {
  const { voices, hasSamples, status, retry } = useVoiceCatalog();
  const { token, apiUrl } = useAuth();
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
  });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [pick, setPick] = useState<string | null>(selected);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // A sample that cannot be loaded is marked, not retried in a loop.
  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (s === 'error' && playingId) setFailed((prev) => new Set(prev).add(playingId));
  });
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => setElapsed(player.currentTime), 500);
    return () => clearInterval(t);
  }, [isPlaying, player]);
  // Leaving the page stops the sample.
  useEffect(() => () => void pauseQuietly(player), [player]);

  const toggle = async (url: string, id: string) => {
    const action = nextPlayback(isPlaying ? playingId : null, id);
    if (action === 'pause') {
      pauseQuietly(player);
      return;
    }
    setElapsed(0);
    // A sample served by our own API needs the sign-in header; a signed storage link must not get it.
    const own = apiUrl ? url.startsWith(apiUrl.replace(/\/$/, '')) : false;
    try {
      await player.replaceAsync(own && token ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : { uri: url });
      setPlayingId(id);
      player.play();
    } catch {
      setFailed((prev) => new Set(prev).add(id));
    }
  };

  const chosen = pick === null ? null : voices.find((v) => v.id === pick);
  const useLabel = pick === null ? 'Use channel default' : `Use ${chosen?.displayName ?? 'this voice'}`;

  return (
    <>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={`Back to ${backLabel ?? 'the previous page'}`} style={styles.back}>
          <Text style={styles.backText}>‹ {backLabel ?? 'Back'}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {status === 'error' ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Voices couldn&apos;t load.</Text>
          <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {status === 'loading' ? <Text style={styles.note}>Loading voices…</Text> : null}
      {status === 'ready' && !hasSamples ? <Text style={styles.note}>Voice samples aren&apos;t available yet.</Text> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {defaultLabel ? <Row label={defaultLabel} active={pick === null} onChoose={() => setPick(null)} /> : null}
        {voices.map((v) => (
          <Row
            key={v.id}
            label={v.displayName}
            tags={v.toneTags}
            description={v.description}
            active={v.id === pick}
            onChoose={() => setPick(v.id)}
            samples={(['sad', 'hopeful'] as const).map((which) => {
              const id = sampleId(v.id, which);
              const playing = isPlaying && playingId === id;
              const bad = failed.has(id);
              const available = v.previews !== null;
              return {
                key: which,
                text: sampleButtonText({ which, playing, elapsed, failed: bad, available }),
                disabled: bad || !available,
                playing,
                onToggle: () => v.previews && void toggle(v.previews[which], id),
              };
            })}
          />
        ))}
      </ScrollView>
      <PrimaryButton
        label={useLabel}
        disabled={pick === null ? defaultLabel === undefined : !chosen}
        onPress={() => {
          pauseQuietly(player);
          onUse(pick);
        }}
      />
    </>
  );
}

type Sample = { key: string; text: string; disabled: boolean; playing: boolean; onToggle: () => void };

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
                key={smp.key}
                onPress={smp.onToggle}
                disabled={smp.disabled}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${smp.text} ${label}`}
                style={[styles.play, smp.playing && styles.playOn, smp.disabled && styles.playOff]}
              >
                <Text style={[styles.playText, smp.disabled && styles.playTextOff]}>{smp.text}</Text>
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
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { fontFamily: font.black, fontSize: 15, color: color.accentText },
  title: { ...type.stackTitle, color: color.ink },
  note: { ...type.meta, fontSize: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  noticeText: { ...type.body, color: color.danger },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontFamily: font.black, fontSize: 14, color: color.accentText },
  list: { maxHeight: 400 },
  listContent: { gap: space.xs },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  rowActive: { backgroundColor: color.accentSoft },
  play: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface2 },
  playOn: { backgroundColor: color.ink },
  playOff: { backgroundColor: color.surface2 },
  playText: { fontFamily: font.bold, fontSize: 12, color: color.ink },
  playTextOff: { color: color.muted },
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pick: { gap: 2, minHeight: 44, justifyContent: 'center' },
  text: { flex: 1, gap: 6, justifyContent: 'center' },
  label: { fontFamily: font.bold, fontSize: 16, color: color.ink },
  caption: { ...type.meta, fontSize: 12 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: color.accent, borderColor: color.accent },
});

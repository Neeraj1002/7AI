import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useAuthedVideoSource } from '../lib/use-video-source';
import { mediaLink, mmss } from '../lib/long-video';
import { color, font, radius, space, type } from '../lib/theme';

export type Chapter = { title: string; startSec?: number };

const LOAD_TIMEOUT_MS = 20_000;

function seekPlayer(p: VideoPlayer, sec: number) {
  p.currentTime = sec;
}

// Sprint 4 FE N3 R2 — the 16:9 player for a long video's 720p preview, with the chapter list under it. The full
// video is never played here. If the preview does not load: "The preview couldn't load. Try again." with Retry;
// Approve and Reject live in the action bar and keep working.
export function LongPreview({
  previewUrl,
  apiUrl,
  token,
  chapters,
  lengthLabel,
}: {
  previewUrl: string | undefined;
  apiUrl: string | null;
  token: string;
  chapters: Chapter[] | undefined;
  /** "10:02", when the response says how long the video is. */
  lengthLabel?: string | null;
}) {
  const link = mediaLink(previewUrl, apiUrl);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const source = useAuthedVideoSource(link?.url ?? null, token, link?.sendAuth ?? true, attempt);
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const hasSource = source !== null;

  useEffect(() => {
    if (!link) return;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setFailed(true);
      if (status === 'readyToPlay') setFailed(false);
    });
    // Web fetches the whole file first and leaves the source empty on a bad answer, so give up after a while.
    const t = setTimeout(() => {
      if (!hasSource) setFailed(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      sub.remove();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, attempt, link?.url, hasSource]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
    try {
      player.replace(source);
      player.play();
    } catch {
      // The status listener reports it again if the source is still bad.
    }
  };

  const seek = (sec: number | undefined) => {
    if (sec === undefined) return;
    try {
      seekPlayer(player, sec);
    } catch {
      // Not seekable yet.
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Preview · 720p</Text>
        {lengthLabel ? <Text style={styles.label}>{lengthLabel}</Text> : null}
      </View>
      {!link ? (
        <View style={[styles.player, styles.center]}>
          <Text style={styles.onDark}>No preview yet.</Text>
        </View>
      ) : failed ? (
        <View style={[styles.player, styles.center, styles.gap]}>
          <Text style={styles.onDark}>The preview couldn&apos;t load. Try again.</Text>
          <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : source ? (
        <VideoView key={attempt} style={styles.player} player={player} nativeControls contentFit="contain" />
      ) : (
        <View style={[styles.player, styles.center]}>
          <ActivityIndicator color={color.onAccent} />
        </View>
      )}
      {chapters && chapters.some((c) => c.startSec !== undefined) ? (
        <View>
          {chapters.map((c, i) => (
            <Pressable
              key={`${i}-${c.title}`}
              onPress={() => seek(c.startSec)}
              style={styles.chapterRow}
              accessibilityRole="button"
              accessibilityLabel={`${c.startSec !== undefined ? mmss(c.startSec) : ''} ${c.title}`}
            >
              <Text style={styles.chapterTime}>{c.startSec !== undefined ? mmss(c.startSec) : ''}</Text>
              <Text style={styles.chapterTitle} numberOfLines={2}>
                {c.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: font.bold, fontSize: 12, color: color.muted },
  player: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: color.video, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  gap: { gap: space.sm },
  onDark: { ...type.meta, color: color.onAccent, textAlign: 'center' },
  retry: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.onAccent,
  },
  retryText: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  chapterRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  chapterTime: { width: 44, fontFamily: font.bold, fontSize: 13, color: color.muted },
  chapterTitle: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
});

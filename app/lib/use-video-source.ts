import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { VideoSource } from 'expo-video';

// expo-video's `headers` option on a video source is iOS/Android-only (see
// VideoPlayer.types.d.ts — explicitly not documented for web), which matters
// here since there's no Android/iOS simulator in this dev environment and
// this app is also exercised via `expo start --web`. On web, this instead
// fetches the video with the Authorization header itself and hands the
// player a local blob: URL (no header needed at that point) — same end
// result (an authenticated video stream), different mechanism per platform.
// On a real device/simulator this branch is never taken; the native player
// gets the header directly, which is what actually proves the API's Range
// support end to end (a blob: URL wouldn't exercise that).
// `sendAuth` is false for a signed storage link, which must not get our Authorization header.
export function useAuthedVideoSource(url: string | null, token: string, sendAuth = true, reloadKey = 0): VideoSource | null {
  // The blob belongs to the url (and reload) it was fetched for; another one never shows the old file.
  const [blob, setBlob] = useState<{ key: string; uri: string } | null>(null);
  const key = `${url}|${reloadKey}`;

  useEffect(() => {
    if (!url || Platform.OS !== 'web') return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url, sendAuth ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        if (!res.ok) return;
        const file = await res.blob();
        objectUrl = URL.createObjectURL(file);
        if (!cancelled) setBlob({ key, uri: objectUrl });
      } catch {
        // Left null — the screen renders its own "video unavailable" state.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, sendAuth, key]);

  return useMemo<VideoSource | null>(() => {
    if (!url) return null;
    if (Platform.OS === 'web') return blob && blob.key === key ? { uri: blob.uri } : null;
    return sendAuth ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : { uri: url };
  }, [url, token, blob, key, sendAuth]);
}

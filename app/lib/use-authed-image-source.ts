import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

// Same reasoning as use-video-source.ts's useAuthedVideoSource: RN's <Image>
// `source={{uri, headers}}` works on iOS/Android but not web, so web fetches
// the bytes itself and hands back a blob: URL instead.
export function useAuthedImageSource(url: string | null, token: string): ImageSourcePropType | null {
  // The blob belongs to the url it was fetched for; a different url never shows the old one.
  const [blob, setBlob] = useState<{ key: string; uri: string } | null>(null);

  useEffect(() => {
    if (!url || Platform.OS !== 'web') return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const file = await res.blob();
        objectUrl = URL.createObjectURL(file);
        if (!cancelled) setBlob({ key: url, uri: objectUrl });
      } catch {
        // Left null — the caller renders its own empty state.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  return useMemo<ImageSourcePropType | null>(() => {
    if (!url) return null;
    if (Platform.OS === 'web') return blob && blob.key === url ? { uri: blob.uri } : null;
    return { uri: url, headers: { Authorization: `Bearer ${token}` } };
  }, [url, token, blob]);
}

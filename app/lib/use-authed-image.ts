import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Sprint 6 Task 1: the address of a thumbnail picture as an <Image> source. A signed link needs nothing more.
// The plain path needs the session header: native <Image> sends it itself; on web it is fetched with the header
// and handed over as a local blob (same reason as use-video-source.ts). Null until it is ready.
export function useAuthedImageSource(url: string | null, token: string, sendAuth: boolean): { uri: string; headers?: Record<string, string> } | null {
  const [blob, setBlob] = useState<{ url: string; uri: string } | null>(null);
  const needsBlob = Boolean(url) && sendAuth && Platform.OS === 'web';

  useEffect(() => {
    if (!url || !needsBlob) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setBlob({ url, uri: objectUrl });
      } catch {
        // Left null: the card shows its blank picture box.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, needsBlob]);

  if (!url) return null;
  if (needsBlob) return blob && blob.url === url ? { uri: blob.uri } : null;
  return sendAuth ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : { uri: url };
}

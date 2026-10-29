import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './Card';
import { useAuthedImageSource } from '../lib/use-authed-image';
import { downloadLink, pictureLink } from '../lib/packaging';
import { thumbnailCard, type ThumbnailResult } from '../lib/gate2-packaging';
import { color, font, radius, space, type } from '../lib/theme';

// Sprint 6 Task 1 (Gate 2 package screens, FE): the after-publishing thumbnail card, from `runs.get.thumbnail`.
// A custom thumbnail is shown as live only when the server says `live`. The reason text is the server's, never ours.

export function Gate2Thumbnail({
  thumbnail,
  apiUrl,
  token,
  pictureUrl,
}: {
  thumbnail: ThumbnailResult | null | undefined;
  apiUrl: string | null;
  token: string;
  /** The chosen package's picture (feed size) from `runs.packaging`, when known. */
  pictureUrl: string | null;
}) {
  const card = thumbnailCard(thumbnail);
  const link = pictureUrl ? pictureLink(pictureUrl, apiUrl) : null;
  const source = useAuthedImageSource(link?.url ?? null, token, link?.sendAuth ?? true);
  if (!card) return null;
  // A frame-grab cover keeps today's behaviour (no card here; the cover-frame line on the run screen stays), and no download.
  if (card.kind === 'frame_grab') return null;
  if (card.kind === 'youtube_chose') {
    return (
      <View style={styles.plain}>
        <Text style={styles.plainText}>{card.line}</Text>
      </View>
    );
  }
  const notApplied = card.kind === 'not_applied';
  const download = notApplied && card.downloadable && thumbnail?.fileUrl ? downloadLink(thumbnail.fileUrl, apiUrl) : null;
  return (
    <Card style={notApplied ? styles.amber : undefined}>
      <View style={[styles.imageWrap, notApplied && styles.grey]}>
        {source ? <Image source={source} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors /> : <View style={[styles.image, styles.blank]} />}
        <View style={[styles.tag, card.kind === 'live' && styles.tagLive, notApplied && styles.tagOff]}>
          {card.kind === 'live' ? <Feather name="check" size={12} color={color.okText} /> : null}
          <Text style={[styles.tagText, card.kind === 'live' && { color: color.okText }, notApplied && { color: color.warnText }]}>{card.tag}</Text>
        </View>
      </View>
      {notApplied ? (
        <>
          <Text style={styles.head}>YouTube didn’t take the thumbnail</Text>
          {card.reasonText ? <Text style={styles.body}>{card.reasonText}</Text> : null}
          {download ? (
            <Pressable onPress={() => void Linking.openURL(download)} accessibilityRole="link" style={styles.download}>
              <Feather name="download" size={18} color={color.onAccent} />
              <Text style={styles.downloadText}>Download image</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  amber: { backgroundColor: color.warnSoft, borderColor: color.amber },
  imageWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.video },
  grey: { opacity: 0.55 },
  image: { width: '100%', height: '100%' },
  blank: { backgroundColor: color.surface2 },
  tag: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color.surface, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagLive: { backgroundColor: color.okBg },
  tagOff: { backgroundColor: color.warnBg },
  tagText: { fontFamily: font.black, fontSize: 12, color: color.ink },
  head: { fontFamily: font.black, fontSize: 16, color: color.ink },
  body: { ...type.body, color: color.ink },
  download: { height: 54, borderRadius: radius.lg, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  downloadText: { fontFamily: font.black, fontSize: 16, color: color.onAccent },
  plain: { paddingVertical: space.xs },
  plainText: { ...type.meta },
});

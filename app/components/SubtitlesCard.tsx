import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { StatusChip } from './StatusChip';
import { mediaLink } from '../lib/long-video';
import { color, font, space, type } from '../lib/theme';

// Sprint 4 FE N3 R2.6 — the subtitles card on a published long video. The chip needs `subtitlesUploaded`; when it is
// false the server's `subtitlesMessage` is shown exactly as sent. There is no "Reconnect to upload" button (founder
// decision 2026-10-11). The .srt download is offered for every long video, uploaded or not.
export function SubtitlesCard({
  subtitlesUploaded,
  subtitlesMessage,
  subtitlesUrl,
  apiUrl,
}: {
  subtitlesUploaded: boolean | undefined;
  subtitlesMessage: string | undefined;
  subtitlesUrl: string | undefined;
  apiUrl: string | null;
}) {
  const link = mediaLink(subtitlesUrl, apiUrl);
  if (subtitlesUploaded === undefined && !link) return null;
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Subtitles</Text>
        {subtitlesUploaded === true ? <StatusChip kind="ok" label="✓ Uploaded" /> : null}
        {subtitlesUploaded === false ? <StatusChip kind="attention" label="! Not uploaded" /> : null}
      </View>
      {subtitlesUploaded === false && subtitlesMessage ? <Text style={styles.body}>{subtitlesMessage}</Text> : null}
      {link ? (
        <Pressable onPress={() => void Linking.openURL(link.url)} style={styles.download} accessibilityRole="link">
          <Text style={styles.downloadText}>↓ Subtitles (.srt)</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  title: { fontFamily: font.black, fontSize: 16, color: color.ink },
  body: { ...type.body, color: color.ink },
  download: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  downloadText: { fontFamily: font.black, fontSize: 14, color: color.accentText },
});

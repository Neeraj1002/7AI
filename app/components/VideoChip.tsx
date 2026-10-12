import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { color, font } from '../lib/theme';
import { videoChipLabel } from '../lib/long-video';

// The black "Video · 10 min" chip for a long run (Run title, Queue row, Inbox card). A Short has no chip.
export function VideoChip({ videoKind, targetSeconds }: { videoKind: string | undefined | null; targetSeconds: number | undefined | null }) {
  const label = videoChipLabel(videoKind, targetSeconds);
  if (!label) return null;
  return (
    <View style={styles.chip} accessibilityLabel={label}>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: color.ink },
  text: { fontFamily: font.black, fontSize: 11, color: color.onAccent },
});

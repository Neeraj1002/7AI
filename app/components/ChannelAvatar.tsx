import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { channelColors, font, radius } from '../lib/theme';

export function ChannelAvatar({ index, size = 44 }: { index: number; size?: 40 | 44 | 60 }) {
  const [bg, fg] = channelColors[((index % channelColors.length) + channelColors.length) % channelColors.length];
  const fontSize = size >= 60 ? 22 : size >= 44 ? 16 : 14;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * (radius.md / 44), backgroundColor: bg },
      ]}
    >
      <Text style={[styles.label, { color: fg, fontSize }]}>{index >= 0 ? index + 1 : '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.black },
});

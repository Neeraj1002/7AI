import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { font, color } from '../lib/theme';

// Clamps long text to `lines`, with a toggle shown only when the text is
// actually longer than that (checked via onTextLayout — Android's layout
// pass reports the real line count even though numberOfLines then truncates
// what's drawn). Task 5/R2: Run detail's review notes/script/rationale/error
// text filled the whole screen with no length limit.
export function ClampedText({
  text,
  lines,
  style,
  moreLabel = 'Show more',
  lessLabel = 'Show less',
}: {
  text: string;
  lines: number;
  style?: StyleProp<TextStyle>;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState<number | null>(null);
  const canToggle = lineCount !== null && lineCount > lines;

  return (
    <View>
      <Text
        style={style}
        numberOfLines={expanded ? undefined : lines}
        onTextLayout={(e) => {
          if (lineCount === null) setLineCount(e.nativeEvent.lines.length);
        }}
      >
        {text}
      </Text>
      {canToggle ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
          <Text style={styles.toggle}>{expanded ? lessLabel : moreLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { fontFamily: font.black, fontSize: 13, color: color.accentText, marginTop: 4 },
});

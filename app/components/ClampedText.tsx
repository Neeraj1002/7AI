import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { font, color } from '../lib/theme';

// Clamps long text to `lines`, with a "Show more" directly under the clamped text, shown only when the text really is
// longer. Task 5/R2: Run detail's review notes/script/rationale/error text filled the whole screen with no limit.
//
// Sprint 5 Task 7 R11.1: the real line count now comes from a second, invisible copy of the text laid out without a
// limit. Reading it from the clamped text's own onTextLayout stopped at the clamp on some devices, so the brief ended in
// "..." with no way to open it.
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
  const [measured, setMeasured] = useState<{ text: string; count: number } | null>(null);
  // A measurement belongs to the text it was taken for; new text is measured again.
  const canToggle = measured !== null && measured.text === text && measured.count > lines;

  return (
    <View>
      <Text style={style} numberOfLines={expanded ? undefined : lines}>
        {text}
      </Text>
      <Text
        style={[style, styles.measure]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onTextLayout={(e) => {
          const count = e.nativeEvent.lines.length;
          setMeasured((m) => (m && m.text === text && m.count === count ? m : { text, count }));
        }}
      >
        {text}
      </Text>
      {canToggle ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={styles.hit}>
          <Text style={styles.toggle}>{expanded ? lessLabel : moreLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same width as the visible copy (it sits in the same View), no height of its own, never seen or touched.
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  hit: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  toggle: { fontFamily: font.black, fontSize: 13, color: color.accentText },
});

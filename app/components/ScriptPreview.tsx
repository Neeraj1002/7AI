import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, type } from '../lib/theme';
import { ClampedText } from './ClampedText';

type Chapter = { title: string; text?: string | null };

// The Script card of the Run screen (Sprint 5 Task 7 R11.1). A short script is clamped to a few lines; a chaptered one
// opens on the first lines of chapter 1 instead of two whole chapters. "Show full script" sits directly under the
// preview, and the same button folds it back.
export function ScriptPreview({ chapters, scriptText, lines = 5 }: { chapters?: Chapter[]; scriptText: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!chapters || chapters.length === 0) {
    return <ClampedText lines={lines} style={styles.body} text={scriptText} moreLabel="Show full script" lessLabel="Show less" />;
  }
  const shown = expanded ? chapters : chapters.slice(0, 1);
  return (
    <View>
      {shown.map((c, i) => (
        <View key={`${i}-${c.title}`} style={styles.chapter}>
          <Text style={styles.meta}>Chapter {i + 1}</Text>
          <Text style={styles.heading}>{c.title}</Text>
          {c.text ? (
            expanded ? (
              <Text style={styles.body}>{c.text}</Text>
            ) : (
              <Text style={styles.body} numberOfLines={lines}>
                {c.text}
              </Text>
            )
          ) : null}
        </View>
      ))}
      <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={styles.hit}>
        <Text style={styles.toggle}>
          {expanded ? 'Show less' : chapters.length > 1 ? `Show full script · ${chapters.length} chapters` : 'Show full script'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: { gap: 2, paddingBottom: 8 },
  meta: { ...type.meta },
  heading: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  body: { ...type.body, color: color.ink },
  hit: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  toggle: { fontFamily: font.black, fontSize: 13, color: color.accentText },
});

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { color, radius, space, type } from '../lib/theme';
import { Card } from './Card';
import { ClampedText } from './ClampedText';
import { gate1Lists, repeatTopicBanner, type ScriptReview } from '../lib/gate1-review';

// Sprint 4 FE E6 — amber banner at the top of Gate 1; tapping opens the earlier run.
export function RepeatTopicBanner({ review }: { review: ScriptReview }) {
  const banner = repeatTopicBanner(review);
  if (!banner) return null;
  return (
    <Pressable
      style={styles.banner}
      onPress={() => router.push({ pathname: '/run/[id]', params: { id: banner.runId } })}
      accessibilityRole="link"
      accessibilityLabel={banner.text}
    >
      <Text style={styles.bannerText}>{banner.text}</Text>
      <Feather name="chevron-right" size={18} color={color.warnText} />
    </Pressable>
  );
}

function ListCard({ title, items, tint }: { title: string; items: string[]; tint?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Card style={tint ? styles.tint : undefined}>
      <Text style={styles.title}>
        {title} · {items.length}
      </Text>
      {items.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.bullet}>•</Text>
          <ClampedText lines={3} style={styles.itemText} text={item} />
        </View>
      ))}
    </Card>
  );
}

// Sprint 4 FE E3 — each card is hidden when its list is empty.
export function Gate1ReviewCards({ review }: { review: ScriptReview }) {
  const { factualConcerns, styleGuideViolations, sources } = gate1Lists(review);
  return (
    <>
      <ListCard title="Factual concerns" items={factualConcerns} tint />
      <ListCard title="Style guide violations" items={styleGuideViolations} />
      <ListCard title="Sources you gave" items={sources} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.warnBg,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  bannerText: { ...type.body, flex: 1, color: color.warnText },
  tint: { backgroundColor: color.warnBg },
  title: { ...type.sectionTitle, color: color.ink },
  item: { flexDirection: 'row', gap: space.sm },
  bullet: { ...type.body, color: color.ink },
  itemText: { ...type.meta, flex: 1, color: color.ink },
});

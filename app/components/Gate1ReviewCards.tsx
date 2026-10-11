import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { color, font, space } from '../lib/theme';
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
      <View style={styles.bannerBody}>
        <Text style={styles.bannerText}>{banner.text}</Text>
        <Text style={styles.bannerLink}>Open that run ›</Text>
      </View>
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
          <Text style={[styles.bullet, tint && styles.bulletWarn]}>•</Text>
          <ClampedText lines={3} style={[styles.itemText, tint && styles.itemTextWarn]} text={item} />
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
    borderRadius: 14,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bannerBody: { flex: 1, gap: 4 },
  bannerText: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.warnText },
  bannerLink: { fontFamily: font.black, fontSize: 13, lineHeight: 18, color: color.warnText },
  // Board "Gate 1": the Factual concerns card is a lighter amber (#FFFBEF) with amber text.
  tint: { backgroundColor: color.warnSoft },
  title: { fontFamily: font.black, fontSize: 15, color: color.ink },
  item: { flexDirection: 'row', gap: space.xs },
  bullet: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  itemText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  itemTextWarn: { color: color.warnText },
  bulletWarn: { color: color.warnText },
});

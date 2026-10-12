import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { useChannels } from '../../../lib/channel-context';
import { relativeTime } from '../../../lib/run-labels';
import { buildInboxCards, reviewLabel, type InboxCard, type InboxNotification, type InboxRun, type StepTone } from '../../../lib/inbox';
import { ENDED_STATUSES, QUEUE_POLL_MS, QUEUE_STATUSES } from '../../../lib/run-queries';
import { channelDotColor, color, font, radius, space, type } from '../../../lib/theme';
import { Screen } from '../../../components/Screen';

// The in-app inbox: one card per run (Sprint 4 Frontend Task 2, R3). Notifications are grouped by run in the app.
// The step timeline comes from the same `runs.list` queries the Queue uses (shared cache); there is no `runs.get`
// per card, and the decision itself is made on the Run screen (the button opens it).
export default function NotificationsScreen() {
  const trpc = useTRPC();
  const { channelById, channelIndex } = useChannels();
  const notifications = useQuery(trpc.notifications.list.queryOptions());
  const active = useQuery(trpc.runs.list.queryOptions({ statuses: [...QUEUE_STATUSES] }, { refetchInterval: QUEUE_POLL_MS }));
  const ended = useQuery(trpc.runs.list.queryOptions({ statuses: [...ENDED_STATUSES] }));

  const { needsYou, earlier } = useMemo(
    () =>
      buildInboxCards(
        (notifications.data ?? []) as InboxNotification[],
        [...(active.data ?? []), ...(ended.data ?? [])] as InboxRun[],
      ),
    [notifications.data, active.data, ended.data],
  );

  const isLoading = notifications.isLoading;
  const isFetching = notifications.isFetching || active.isFetching || ended.isFetching;
  const refetchAll = () => Promise.all([notifications.refetch(), active.refetch(), ended.refetch()]);

  const channelLine = (card: InboxCard) => {
    if (!card.channelId) return null;
    const idx = channelIndex(card.channelId);
    return { name: channelById(card.channelId)?.name ?? 'Deleted channel', dot: idx >= 0 ? channelDotColor(idx) : color.future };
  };

  return (
    <Screen
      variant="tabRoot"
      title="Inbox"
      subtitle={needsYou.length > 0 ? `${needsYou.length} ${needsYou.length === 1 ? 'needs' : 'need'} you` : 'Nothing needs you right now'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetchAll()} />}
      >
        {!isLoading && needsYou.length === 0 && earlier.length === 0 ? (
          <Text style={styles.empty}>Nothing needs you right now.</Text>
        ) : null}

        {needsYou.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Needs you</Text>
            {needsYou.map((card) => (
              <RunCard key={card.key} card={card} channel={channelLine(card)} needsYou />
            ))}
          </>
        ) : null}

        {earlier.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, needsYou.length > 0 && styles.sectionGap]}>Earlier</Text>
            {earlier.map((card) => (
              <RunCard key={card.key} card={card} channel={channelLine(card)} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const TONE: Record<StepTone, { bg: string; fg: string }> = {
  ok: { bg: color.okText, fg: color.okText },
  alert: { bg: color.accent, fg: color.accent },
  warn: { bg: color.warnText, fg: color.warnText },
  fail: { bg: color.danger, fg: color.danger },
  dark: { bg: color.ink, fg: color.ink },
};

function ago(date: Date | null): string {
  return date ? relativeTime(date).replace(/ ago$/, '') : '';
}

function RunCard({ card, channel, needsYou }: { card: InboxCard; channel: { name: string; dot: string } | null; needsYou?: boolean }) {
  const open = () => router.push({ pathname: '/run/[id]', params: { id: card.runId! } });
  return (
    <View style={[styles.card, needsYou && styles.cardNeedsYou]}>
      <Text style={styles.title} numberOfLines={3}>
        {card.title}
      </Text>
      {channel ? (
        <View style={styles.channelLine}>
          <View style={[styles.dot, { backgroundColor: channel.dot }]} />
          <Text style={styles.channel} numberOfLines={1}>
            {channel.name}
          </Text>
        </View>
      ) : null}
      {card.steps?.map((step) => (
        <View key={step.key} style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: TONE[step.tone].bg }]}>
            <Text style={styles.stepGlyph}>{step.glyph}</Text>
          </View>
          <Text style={styles.stepName}>{step.name}</Text>
          <Text style={[styles.stepWord, { color: TONE[step.tone].fg }]}>{step.word}</Text>
          <Text style={styles.stepTime}>{ago(step.when)}</Text>
        </View>
      ))}
      {card.runId ? (
        needsYou ? (
          <Pressable style={styles.reviewButton} onPress={open} accessibilityRole="button">
            <Text style={styles.reviewText}>{reviewLabel(card.gate)}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.openRun} onPress={open} accessibilityRole="button">
            <Text style={styles.openRunText}>Open run →</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: 10 },
  empty: { padding: 24, textAlign: 'center', ...type.body, color: color.muted },
  sectionTitle: { fontFamily: font.black, fontSize: 16, color: color.ink },
  sectionGap: { paddingTop: space.sm },
  card: { borderWidth: 1.5, borderColor: color.ink, borderRadius: radius.xl, backgroundColor: color.surface, paddingVertical: 14, paddingHorizontal: space.lg, gap: 4 },
  cardNeedsYou: { borderWidth: 2, borderColor: color.accent },
  title: { fontFamily: font.black, fontSize: 15, lineHeight: 20, color: color.ink },
  channelLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  channel: { fontFamily: font.regular, fontSize: 12, color: color.muted, flexShrink: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  stepIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: font.black, fontSize: 12, color: color.onAccent },
  stepName: { flexGrow: 1, flexShrink: 1, fontFamily: font.bold, fontSize: 14, color: color.ink },
  stepWord: { fontFamily: font.bold, fontSize: 12 },
  stepTime: { width: 44, textAlign: 'right', fontFamily: font.regular, fontSize: 12, color: color.muted },
  reviewButton: { marginTop: space.sm, minHeight: 44, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  reviewText: { fontFamily: font.black, fontSize: 14, color: color.onAccent },
  openRun: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  openRunText: { fontFamily: font.black, fontSize: 13, color: color.accent },
});

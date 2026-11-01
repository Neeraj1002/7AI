import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font } from '../lib/theme';
import { FAIL_INTRO, NO_SWIPE_LINE, NOT_CHECKED_LEAD, SCRIPT_CHANGED_BANNER, notCheckedWhy, swipeStrip, type ScriptCheck } from '../lib/story-tests';

// Sprint 6 Task 3 (NEXT 5, board S3ScriptCheck). Advice only: it sits under the Script review card and never touches the
// Approve, Edit and Reject bar. Every verdict, reason and line is the server's; a fail is amber, never red.

function Pill({ text, bg, fg, big }: { text: string; bg: string; fg: string; big?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, big && styles.pillBig]}>
      <Text style={[styles.pillText, big && styles.pillTextBig, { color: fg }]}>{text}</Text>
    </View>
  );
}

function Field({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <View style={styles.quoteBox}>
      <Text style={styles.quote}>“{text}”</Text>
    </View>
  );
}

function SwipeStrip({ percent }: { percent: number }) {
  return (
    <View style={styles.stripWrap}>
      <View style={styles.strip}>
        <View style={[styles.dot, { left: `${percent}%`, marginLeft: -(percent / 100) * 14 }]} />
      </View>
      <View style={styles.stripCaps}>
        <Text style={styles.cap}>Start of script</Text>
        <Text style={styles.cap}>End</Text>
      </View>
    </View>
  );
}

export function ScriptCheckCard({ check }: { check: ScriptCheck }) {
  const [more, setMore] = useState(false);
  if (check.status === 'not_run') {
    const why = notCheckedWhy(check.notRunReason);
    return (
      <View style={[styles.card, styles.notChecked]}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Script check</Text>
          <Pill text="Not checked" bg={color.surface2} fg={color.muted} big />
        </View>
        <Text style={styles.body}>{NOT_CHECKED_LEAD}</Text>
        {why ? <Text style={styles.why}>{why}</Text> : null}
        <Text style={styles.note}>{check.advisoryNote}</Text>
      </View>
    );
  }
  const pass = check.verdict === 'pass';
  const failed = check.verdict === 'fail';
  const strip = swipeStrip(check);
  return (
    <View style={styles.card}>
      {check.scriptChanged ? (
        <View style={styles.banner}>
          <Feather name="alert-circle" size={18} color={color.warnText} />
          <Text style={styles.bannerText}>{SCRIPT_CHANGED_BANNER}</Text>
        </View>
      ) : null}
      <View style={[styles.rest, check.scriptChanged && styles.dim]}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Script check</Text>
          <View style={styles.pills}>
            <Pill text="Advice only" bg={color.surface2} fg={color.muted} />
            {check.verdictLabel ? <Pill text={check.verdictLabel} bg={pass ? color.okBg : color.warnBg} fg={pass ? color.okText : color.warnText} big /> : null}
          </View>
        </View>

        {failed ? (
          <View style={styles.reasons}>
            <Text style={styles.why}>{FAIL_INTRO}</Text>
            {check.reasons.length > 0 ? <Text style={styles.label}>Why a stranger may swipe away</Text> : null}
            {check.reasons.map((r, i) => (
              <View key={i} style={styles.reasonRow}>
                <View style={styles.bullet} />
                <Text style={styles.reasonText}>{r.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={styles.label}>Where a stranger would first swipe away</Text>
          {check.swipeLine !== null ? <Quote text={check.swipeLine} /> : <Text style={styles.body}>{NO_SWIPE_LINE}</Text>}
          {strip ? <SwipeStrip percent={strip.percent} /> : null}
        </View>

        {check.weakestSentence ? (
          <View style={styles.group}>
            <Text style={styles.label}>Weakest sentence</Text>
            <Quote text={check.weakestSentence.quote} />
            <Text style={styles.why}>Why: {check.weakestSentence.why}</Text>
          </View>
        ) : null}

        <View style={styles.aboutBox}>
          <Field label="The reader says this video is about" text={check.about} />
          <Field label="What it remembers at the end" text={check.remembered} />
        </View>

        <Pressable onPress={() => setMore((v) => !v)} style={styles.fold} accessibilityRole="button">
          <Text style={styles.foldText}>{more ? 'Hide more from the reader' : 'More from the reader'}</Text>
        </Pressable>
        {more ? (
          <View style={styles.moreBox}>
            <Field label="Why a stranger would care" text={check.whyCare} />
            {check.firstSentence ? (
              <Field label="Does the first sentence keep them?" text={`${check.firstSentence.keeps ? 'Yes' : 'No'}: ${check.firstSentence.why}`} />
            ) : null}
            <Field label="Matches the angle you chose?" text={check.promiseMatch.note} />
          </View>
        ) : null}
      </View>
      <Text style={styles.noteRule}>{check.advisoryNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.bg },
  notChecked: { gap: 10, borderStyle: 'dashed', borderColor: color.muted },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  title: { fontFamily: font.black, fontSize: 15, color: color.ink },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillBig: { paddingHorizontal: 10 },
  pillText: { fontFamily: font.black, fontSize: 11 },
  pillTextBig: { fontSize: 12 },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  why: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  label: { fontFamily: font.bold, fontSize: 12, color: color.muted },
  field: { gap: 2 },
  group: { gap: 6 },
  reasons: { gap: 8 },
  reasonRow: { flexDirection: 'row', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.warnText, marginTop: 7 },
  reasonText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  quoteBox: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.surface2 },
  quote: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, color: color.ink },
  rest: { gap: 12 },
  dim: { opacity: 0.6 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.warnBg },
  bannerText: { flex: 1, fontFamily: font.black, fontSize: 13, lineHeight: 18, color: color.warnText },
  stripWrap: { gap: 4, paddingTop: 2 },
  strip: { height: 6, borderRadius: 3, backgroundColor: color.border },
  dot: { position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: color.warnText, borderWidth: 2, borderColor: color.bg },
  stripCaps: { flexDirection: 'row', justifyContent: 'space-between' },
  cap: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  aboutBox: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: color.border },
  moreBox: { gap: 10, marginTop: -8 },
  fold: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  foldText: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  noteRule: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.border },
});

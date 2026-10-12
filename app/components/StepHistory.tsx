import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, radius, space } from '../lib/theme';
import type { HistoryAttempt, HistoryStep } from '../lib/run-view';

function clock(d: Date | null): string {
  return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}

const DOT: Record<HistoryStep['state'], { bg: string; glyph: string }> = {
  done: { bg: color.okText, glyph: '✓' },
  current: { bg: color.accent, glyph: '!' },
  failed: { bg: color.danger, glyph: '✕' },
  future: { bg: color.future, glyph: '' },
};

function Attempt({ attempt }: { attempt: HistoryAttempt }) {
  const [raw, setRaw] = useState(false);
  return (
    <View style={styles.attempt}>
      <View style={styles.line}>
        <Text style={[styles.attemptTitle, { color: attempt.failed ? color.danger : color.okText }]}>{attempt.title}</Text>
        <Text style={styles.when}>{clock(attempt.when)}</Text>
      </View>
      {attempt.why ? <Text style={styles.note}>{attempt.why}</Text> : null}
      {attempt.raw ? (
        <>
          <Pressable onPress={() => setRaw((v) => !v)} accessibilityRole="button" style={styles.techLink}>
            <Text style={styles.link}>Technical details ›</Text>
          </Pressable>
          {raw ? <Text style={styles.raw}>{attempt.raw}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

function Step({ step, last }: { step: HistoryStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const dot = DOT[step.state];
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dot.bg }]}>
          <Text style={styles.dotGlyph}>{step.published ? '▶' : dot.glyph}</Text>
        </View>
        {last ? null : <View style={styles.railLine} />}
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.name, step.state === 'future' && styles.nameFuture]}>{step.name}</Text>
          <Text style={styles.when}>{clock(step.when)}</Text>
        </View>
        {step.note ? <Text style={[styles.note, step.warnNote && styles.noteWarn]}>{step.note}</Text> : null}
        {step.attempts.length > 0 ? (
          <>
            <Pressable
              onPress={() => setOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={styles.pillHit}
            >
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {step.attempts.length} attempts {open ? '▲' : '▼'}
                </Text>
              </View>
            </Pressable>
            {open ? (
              <View style={styles.attempts}>
                {step.attempts.map((a) => (
                  <Attempt key={a.key} attempt={a} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

// Step history (NEXT 1 Run board): one row per step, the attempts of a step grouped behind an "{n} attempts" pill.
export function StepHistory({ steps, summary }: { steps: HistoryStep[]; summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.header}>
        <Text style={styles.headerTitle}>Step history</Text>
        <Text style={styles.headerSummary} numberOfLines={1}>
          {summary} {open ? '▲' : '▼'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {steps.map((s, i) => (
            <Step key={s.key} step={s} last={i === steps.length - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  headerTitle: { fontFamily: font.black, fontSize: 15, color: color.ink },
  headerSummary: { fontFamily: font.regular, fontSize: 12, color: color.muted, flexShrink: 1, textAlign: 'right' },
  list: { paddingBottom: space.sm },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  rail: { alignItems: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dotGlyph: { fontFamily: font.black, fontSize: 11, color: color.onAccent },
  railLine: { flexGrow: 1, width: 2, backgroundColor: color.border, marginTop: 2 },
  body: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  name: { fontFamily: font.bold, fontSize: 14, color: color.ink, flexShrink: 1 },
  nameFuture: { color: color.muted },
  when: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  noteWarn: { color: color.warnText },
  pillHit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  pill: { height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: color.warnBg, justifyContent: 'center' },
  pillText: { fontFamily: font.black, fontSize: 12, color: color.warnText },
  attempts: { marginTop: 2, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: color.border },
  attempt: { paddingVertical: 6, gap: 2 },
  attemptTitle: { fontFamily: font.bold, fontSize: 13 },
  techLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: font.black, fontSize: 12, color: color.accent },
  raw: { fontFamily: font.regular, fontSize: 12, color: color.muted },
});

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font, space } from '../lib/theme';
import {
  angleTitle,
  doneStatusPill,
  matchLine,
  notRunAngleLine,
  readerHeading,
  toggleAngle,
  toggleSkip,
  DONE_FOOTER,
  READER_INTRO,
  READER_SECTION_TITLE,
  SKIPPED_LINE,
  WAITING_SUBTITLE,
  type Angle,
  type AngleChoice,
  type AngleStep,
} from '../lib/story-tests';

// Sprint 6 Task 3 (NEXT 5, boards S3AngleWaiting and S3AngleDone). Every word about an angle, a tag, a mark or a reason is the
// server's, shown as given; the headings "First try" / "Second try" and the fixed lines are the app's own.

function Pill({ text, bg, fg, size = 11, bordered }: { text: string; bg: string; fg: string; size?: 11 | 12; bordered?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, size === 12 && styles.pill12, bordered && styles.pillBordered]}>
      <Text style={[size === 12 ? styles.pillText12 : styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function TagRow({ angle, extra }: { angle: Angle; extra?: string }) {
  if (angle.readerTags.length === 0 && !extra) return null;
  return (
    <View style={styles.tags}>
      {extra ? <Pill text={extra} bg={color.ink} fg={color.bg} /> : null}
      {angle.readerTags.map((t, i) => (
        <Pill key={i} text={t.label} bg={t.kind === 'click' ? color.okBg : color.surface2} fg={t.kind === 'click' ? color.okText : color.ink} />
      ))}
    </View>
  );
}

function ReaderSection({ step }: { step: AngleStep }) {
  if (!step.mark && step.readerPicks.length === 0) return null;
  const clear = step.mark === 'clear_winner';
  return (
    <View style={styles.reader}>
      <Text style={styles.sectionTitle}>{READER_SECTION_TITLE}</Text>
      {step.mark ? (
        <View style={styles.markWrap}>
          <Text style={[styles.markText, { backgroundColor: clear ? color.okBg : color.bg, color: clear ? color.okText : color.ink }]}>{step.markLabel ?? ''}</Text>
        </View>
      ) : null}
      <Text style={styles.small}>{READER_INTRO}</Text>
      {step.readerPicks.map((p) => (
        <View key={p.run} style={styles.pick}>
          <Text style={styles.pickHead}>{readerHeading(p.run)}</Text>
          <View style={styles.pickRow}>
            <Pill text="Would click" bg={color.okBg} fg={color.okText} />
            <Text style={styles.pickTitle}>{angleTitle(step.angles, p.clickId)}</Text>
          </View>
          <Text style={styles.why}>“{p.clickWhy}”</Text>
          <View style={styles.pickRow}>
            <Pill text="Would skip" bg={color.bg} fg={color.ink} bordered />
            <Text style={styles.pickTitle}>{angleTitle(step.angles, p.skipId)}</Text>
          </View>
          <Text style={styles.why}>“{p.skipWhy}”</Text>
        </View>
      ))}
    </View>
  );
}

/** Angles are being made: the heading, a line, and four pulsing skeleton cards. No confirm button (the bar says so). */
export function AnglesMakingCard() {
  return (
    <>
      <View style={styles.head}>
        <Text style={styles.h1}>Finding ways to tell this story…</Text>
        <Text style={styles.sub}>{WAITING_SUBTITLE}</Text>
      </View>
      <View style={styles.list}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonCard}>
            <View style={[styles.sk, { height: 16, width: '70%' }]} />
            <View style={[styles.sk, { height: 13, width: '92%' }]} />
            <View style={[styles.sk, { height: 13, width: '55%' }]} />
          </View>
        ))}
      </View>
    </>
  );
}

/** The choose card: a controlled component, the screen owns the choice and the one runs.chooseAngle call. */
export function AngleChooseCard({
  step,
  choice,
  onChange,
  disabled,
}: {
  step: AngleStep;
  choice: AngleChoice;
  onChange: (next: AngleChoice) => void;
  disabled?: boolean;
}) {
  const skipOn = choice.kind === 'skip';
  return (
    <>
      <View style={styles.headTight}>
        <Text style={styles.h1}>How should this story be told?</Text>
        <Text style={styles.sub}>Pick one angle. The script is written only after you choose.</Text>
      </View>
      <ReaderSection step={step} />
      <View style={styles.list}>
        {step.angles.map((a) => {
          const selected = choice.kind === 'angle' && choice.id === a.id;
          return (
            <Pressable
              key={a.id}
              disabled={disabled}
              onPress={() => onChange(toggleAngle(choice, a.id))}
              style={[styles.angle, selected && styles.angleOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={styles.angleTitle}>{a.title}</Text>
              <Text style={styles.body}>{a.promise}</Text>
              {a.figureFlag ? (
                <View style={styles.flag}>
                  <Feather name="flag" size={14} color={color.warnText} />
                  <Text style={styles.flagText}>{a.figureFlag}</Text>
                </View>
              ) : null}
              <TagRow angle={a} />
              <View style={[styles.pickBtn, selected && styles.pickBtnOn]}>
                {selected ? <Feather name="check" size={18} color={color.onAccent} /> : null}
                <Text style={styles.pickBtnText}>{selected ? 'Selected' : 'Choose this angle'}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.skipWrap}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(toggleSkip(choice))}
          style={[styles.skip, skipOn && styles.skipOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: skipOn }}
        >
          <View style={[styles.radio, skipOn && styles.radioOn]}>{skipOn ? <View style={styles.radioDot} /> : null}</View>
          <Text style={styles.skipText}>Write from the brief instead</Text>
          <Feather name="chevron-right" size={16} color={color.ink} />
        </Pressable>
        <Text style={styles.skipNote}>No angle. The script is written from your brief as it is.</Text>
      </View>
    </>
  );
}

/** Angles were not made: one read-only line, no controls. */
export function AngleNotRunCard({ reason }: { reason: string | null }) {
  return (
    <>
      <View style={styles.section}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>Angle</Text>
          <Pill text="Not run" bg={color.surface2} fg={color.muted} size={12} />
        </View>
        <Text style={styles.body}>{notRunAngleLine(reason)}</Text>
      </View>
      <Text style={styles.small}>{DONE_FOOTER}</Text>
    </>
  );
}

/** Summary after the choice (S3AngleDone): chosen or skipped, read-only. */
export function AngleDoneCard({ step }: { step: AngleStep }) {
  const [showAll, setShowAll] = useState(false);
  const pill = doneStatusPill(step);
  const chosen = step.status === 'chosen' ? step.angles.find((a) => a.id === step.chosenId) : undefined;
  const line = step.status === 'chosen' ? matchLine(step.choseReaderPick, angleTitle(step.angles, step.readerTopId ?? '')) : null;
  const same = step.choseReaderPick === true;
  return (
    <>
      <View style={styles.section}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>Angle</Text>
          <Pill text={pill.label} bg={step.status === 'chosen' ? color.okBg : color.surface2} fg={step.status === 'chosen' ? color.okText : color.muted} size={12} />
        </View>
        {step.status === 'skipped' ? <Text style={styles.body}>{SKIPPED_LINE}</Text> : null}
        {chosen ? (
          <>
            <View style={styles.chosenText}>
              <Text style={styles.angleTitle}>{chosen.title}</Text>
              <Text style={styles.body}>{chosen.promise}</Text>
            </View>
            {line ? (
              <View style={styles.match}>
                <Feather name={same ? 'check' : 'info'} size={18} color={same ? color.okText : color.muted} />
                <Text style={styles.matchText}>{line}</Text>
              </View>
            ) : null}
            <Pressable onPress={() => setShowAll((v) => !v)} style={styles.fold} accessibilityRole="button">
              <Text style={styles.foldText}>{showAll ? 'Hide all angles' : "Show all angles and the reader's picks"}</Text>
            </Pressable>
            {showAll ? (
              <View style={styles.allList}>
                {step.angles.map((a) => (
                  <View key={a.id} style={styles.allRow}>
                    <Text style={styles.allTitle}>{a.title}</Text>
                    <Text style={styles.allPromise}>{a.promise}</Text>
                    <TagRow angle={a} extra={a.id === step.chosenId ? 'You chose this' : undefined} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      <Text style={styles.small}>{DONE_FOOTER}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  headTight: { gap: 2 },
  h1: { fontFamily: font.black, fontSize: 18, lineHeight: 22, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  small: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  list: { gap: 10 },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pill12: { paddingHorizontal: 9 },
  pillBordered: { borderWidth: 1, borderColor: color.border },
  pillText: { fontFamily: font.black, fontSize: 11 },
  pillText12: { fontFamily: font.black, fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skeletonCard: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.border },
  sk: { backgroundColor: color.surface2, borderRadius: 6 },
  reader: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.surface2 },
  sectionTitle: { fontFamily: font.black, fontSize: 15, color: color.ink },
  markWrap: { flexDirection: 'row' },
  markText: { overflow: 'hidden', fontFamily: font.black, fontSize: 12, lineHeight: 17, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: color.border },
  pick: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.border },
  pickHead: { fontFamily: font.black, fontSize: 12, color: color.muted },
  pickRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pickTitle: { flex: 1, fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.ink },
  why: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  angle: { gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.bg },
  angleOn: { borderWidth: 3.5, borderColor: color.okText, paddingVertical: 12.5, paddingHorizontal: 14.5 },
  angleTitle: { fontFamily: font.black, fontSize: 16, lineHeight: 21, color: color.ink },
  flag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8, backgroundColor: color.warnBg },
  flagText: { flexShrink: 1, fontFamily: font.black, fontSize: 12, lineHeight: 16, color: color.warnText },
  pickBtn: { height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: color.ink },
  pickBtnOn: { backgroundColor: color.okText },
  pickBtnText: { fontFamily: font.black, fontSize: 15, color: color.onAccent },
  skipWrap: { alignItems: 'center', gap: 4, paddingTop: 4, paddingBottom: space.sm },
  skip: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: color.ink, flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipOn: { borderWidth: 2 },
  skipText: { fontFamily: font.black, fontSize: 14, color: color.ink },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.muted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderWidth: 2, borderColor: color.ink },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.ink },
  skipNote: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted, textAlign: 'center' },
  section: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.ink },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chosenText: { gap: 4 },
  match: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.surface2 },
  matchText: { flex: 1, fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.ink },
  fold: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  foldText: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  allList: { borderTopWidth: 1, borderTopColor: color.border },
  allRow: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.border },
  allTitle: { fontFamily: font.black, fontSize: 14, lineHeight: 19, color: color.ink },
  allPromise: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
});

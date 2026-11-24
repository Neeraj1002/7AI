import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { color, font } from '../lib/theme';
import {
  CHANGE_LINE,
  choiceTags,
  clampNote,
  counterAmber,
  counterText,
  effectiveDirection,
  isDirectionPresetList,
  NOTE_HINT,
  NOTE_MAX,
  SAVE_ERROR,
  savedWithWarning,
  type Direction,
  type DirectionPreset,
} from '../lib/direction';

// Sprint 6 Task 4 (NEXT 6, board T4Direction). Labels, summaries, parts and warnings are the server's, shown as given.
// Choosing only selects: nothing is saved until the screen's own Save button.
export function DirectionCard({
  presets: presetData,
  loading,
  loadFailed,
  saved,
  draft,
  onChange,
  saving,
  savedVersion,
  warnings,
  saveError,
}: {
  presets: DirectionPreset[] | undefined;
  loading: boolean;
  loadFailed: boolean;
  saved: Direction | null;
  draft: Direction;
  onChange: (next: Direction) => void;
  saving: boolean;
  savedVersion: number | null;
  warnings: string[];
  saveError: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const validPresets = isDirectionPresetList(presetData);
  const unavailable = loadFailed || (presetData !== undefined && !validPresets);
  const presets = !loadFailed && validPresets ? presetData : [];
  const currentKey = effectiveDirection(saved).preset;
  const currentLabel = presets.find((p) => p.key === currentKey)?.label ?? '';
  const noteOpen = presets.some((p) => p.key === draft.preset);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Creative direction</Text>
        {currentLabel ? <Text style={styles.current}>{currentLabel}</Text> : null}
      </View>
      <Text style={styles.meta}>How this channel&apos;s videos are told. Pick one.</Text>

      <View style={[styles.choices, saving && styles.dim]} pointerEvents={saving ? 'none' : 'auto'}>
        {loading ? <ActivityIndicator style={styles.loading} /> : null}
        {unavailable ? <Text style={styles.error} accessibilityRole="alert">Couldn&apos;t load the creative directions. Go back and try again.</Text> : null}
        {presets.map((p) => {
          const selected = p.key === draft.preset;
          const tags = choiceTags(p.key, draft, saved);
          const isOpen = Boolean(open[p.key]);
          return (
            <View key={p.key} style={[styles.choice, selected && styles.choiceOn]}>
              <Pressable onPress={() => onChange({ ...draft, preset: p.key })} style={styles.row} accessibilityRole="radio" accessibilityState={{ selected }}>
                <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.rowText}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>{p.label}</Text>
                    {tags.map((t) => (
                      <View key={t} style={[styles.tag, t === 'Current' && styles.tagCurrent]}>
                        <Text style={[styles.tagText, t === 'Current' && styles.tagCurrentText]}>{t}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.summary}>{p.summary}</Text>
                </View>
              </Pressable>
              {p.parts.length > 0 ? (
                <>
                  <Pressable
                    onPress={() => setOpen((o) => ({ ...o, [p.key]: !isOpen }))}
                    style={styles.fold}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <Text style={styles.foldText}>What this changes</Text>
                    <Text style={styles.arrow}>{isOpen ? '▲' : '▼'}</Text>
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.parts}>
                      {p.parts.map((part) => (
                        <View key={part.key} style={styles.part}>
                          <Text style={styles.partLabel}>{part.label}</Text>
                          <Text style={styles.partText}>{part.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}
      </View>

      {noteOpen ? (
        <View style={[styles.noteBox, saving && styles.dim]}>
          <Text style={styles.noteLabel}>
            Your note <Text style={styles.noteOptional}>· optional</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={draft.note}
            onChangeText={(t) => onChange({ ...draft, note: clampNote(t) })}
            placeholder="Add one short note…"
            placeholderTextColor={color.muted}
            maxLength={NOTE_MAX}
            multiline
            editable={!saving}
          />
          <View style={styles.hintRow}>
            <Text style={styles.hint}>{NOTE_HINT}</Text>
            <Text style={[styles.counter, counterAmber(draft.note.length) && styles.counterAmber]}>{counterText(draft.note.length)}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.changeLine}>{CHANGE_LINE}</Text>

      {saveError ? (
        <View style={styles.alert} accessibilityRole="alert">
          <Feather name="alert-circle" size={18} color={color.accentText} />
          <Text style={styles.alertText}>{SAVE_ERROR}</Text>
        </View>
      ) : null}
      {warnings.length > 0 && savedVersion !== null ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>{savedWithWarning(savedVersion)}</Text>
          {warnings.map((w, i) => (
            <Text key={i} style={styles.warnText}>
              {w}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: font.black, fontSize: 15, color: color.ink },
  current: { flexShrink: 1, fontFamily: font.regular, fontSize: 12, color: color.muted },
  meta: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: color.muted },
  choices: { gap: 8 },
  dim: { opacity: 0.55 },
  loading: { marginVertical: 12 },
  error: { fontFamily: font.semibold, fontSize: 13, color: color.danger },
  choice: { borderRadius: 14, borderWidth: 1.5, borderColor: '#CFCFCF', backgroundColor: color.bg },
  choiceOn: { borderWidth: 2, borderColor: color.ink },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 48 },
  rowText: { flex: 1, gap: 4 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  label: { fontFamily: font.black, fontSize: 15, lineHeight: 20, color: color.ink },
  summary: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#8A8A8A', marginTop: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg },
  radioOn: { borderWidth: 2, borderColor: color.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: color.surface2 },
  tagText: { fontFamily: font.black, fontSize: 11, color: color.ink },
  tagCurrent: { backgroundColor: color.okBg },
  tagCurrentText: { color: color.okText },
  fold: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 48, paddingRight: 14 },
  foldText: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  arrow: { fontSize: 11, color: color.accentText },
  parts: { marginLeft: 48, marginRight: 14, marginBottom: 12, borderTopWidth: 1, borderTopColor: color.border },
  part: { gap: 2, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.border },
  partLabel: { fontFamily: font.black, fontSize: 12, color: color.muted },
  partText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  noteBox: { gap: 6 },
  noteLabel: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  noteOptional: { fontFamily: font.regular, color: color.muted },
  input: { minHeight: 96, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.bg, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink, textAlignVertical: 'top' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  hint: { flex: 1, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  counter: { fontFamily: font.black, fontSize: 12, color: color.muted },
  counterAmber: { color: color.warnText },
  changeLine: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: color.ink, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.surface2, overflow: 'hidden' },
  alert: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.accentSoft },
  alertText: { flex: 1, fontFamily: font.black, fontSize: 13, lineHeight: 18, color: color.accentText },
  warnBox: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.warnBg },
  warnTitle: { fontFamily: font.black, fontSize: 13, lineHeight: 18, color: color.warnText },
  warnText: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.warnText },
});

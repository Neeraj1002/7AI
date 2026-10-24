import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PrimaryButton } from './Buttons';
import { color, font, radius, space, type } from '../lib/theme';
import { CHAPTER_HINT, checkChapters, lengthStatus } from '../lib/script-editor';
import type { ChapterBounds } from '../lib/chapter-bounds';
import { copyText } from '../lib/copy-text';

// Sprint 5 Task 7 R7 — the Gate 1 script editor as a full screen, not a bottom sheet under the keyboard. The text box
// takes all the room between the header and the keyboard; the chapter count, word count and length against the target
// update as you type, so a problem with the chapters shows before Save, not after it. The limits (how many chapters, how
// many words in one) are the server's `chapterBounds`; without them the count shows and nothing is limited here.
export function ScriptEditorModal({
  visible,
  initialText,
  isLong,
  bounds,
  pending,
  error,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialText: string;
  /** A long script is edited as "## Chapter" blocks and checked for them. */
  isLong: boolean;
  /** The chapter limits from `runs.get.chapterBounds`; null for a Short or while the server does not send them. */
  bounds?: ChapterBounds | null;
  pending?: boolean;
  /** The server's own rejection, shown as sent. */
  error?: string | null;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* remounted per open so the initial text is re-applied */}
      {visible ? (
        <EditorBody initialText={initialText} isLong={isLong} bounds={bounds ?? null} pending={pending} error={error} onClose={onClose} onSave={onSave} />
      ) : null}
    </Modal>
  );
}

function EditorBody({ initialText, isLong, bounds, pending, error, onClose, onSave }: Omit<Parameters<typeof ScriptEditorModal>[0], 'visible'>) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState<'copied' | 'shared' | null>(null);

  const chapters = isLong ? checkChapters(text, bounds ?? null) : null;
  const length = lengthStatus(text, bounds?.targetWords);
  const blocked = !text.trim() || (chapters !== null && !chapters.ok);

  const copy = async () => {
    try {
      const direct = await copyText(text);
      setCopied(direct ? 'copied' : 'shared');
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior="padding">
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close without saving" style={styles.close}>
          <Feather name="x" size={24} color={color.ink} />
        </Pressable>
        <Text style={styles.title}>Edit script</Text>
        <Pressable onPress={() => void copy()} accessibilityRole="button" style={styles.copy}>
          <Feather name="copy" size={16} color={color.accentText} />
          <Text style={styles.copyText}>{copied === 'copied' ? 'Copied' : copied === 'shared' ? 'Share opened' : 'Copy script'}</Text>
        </Pressable>
      </View>

      <View style={styles.info}>
        {chapters ? (
          <Text style={[styles.status, chapters.ok ? styles.ok : styles.warn]}>
            {chapters.ok ? '✓ ' : '! '}
            {chapters.count} {chapters.count === 1 ? 'chapter' : 'chapters'}
            {chapters.limit ? ` · needs ${chapters.limit}` : ''}
          </Text>
        ) : null}
        <Text style={[styles.status, styles.muted]}>{length.text}</Text>
        {chapters?.advice ? <Text style={[styles.status, styles.warn]}>{chapters.advice}</Text> : null}
        {isLong ? <Text style={styles.hint}>{CHAPTER_HINT}</Text> : null}
      </View>

      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={styles.input}
        value={text}
        onChangeText={setText}
        multiline
        scrollEnabled
        textAlignVertical="top"
        placeholder="Script text…"
        placeholderTextColor={color.muted}
        accessibilityLabel="Script text"
      />

      {chapters && !chapters.ok && chapters.message ? <Text style={styles.warnLine}>{chapters.message}</Text> : null}
      {chapters && chapters.short.length > 0 && bounds ? (
        <Text style={styles.warnLine}>
          {chapters.short.length === 1 ? `"${chapters.short[0].title}" has` : `${chapters.short.length} chapters have`} fewer than {bounds.minWordsPerChapter} words, which the server will refuse.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
        <PrimaryButton label="Save edit" loading={pending} disabled={blocked} onPress={() => onSave(text.trim())} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  close: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.stackTitle, color: color.ink, flex: 1 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.sm },
  copyText: { fontFamily: font.black, fontSize: 13, color: color.accentText },
  info: { paddingHorizontal: space.lg, gap: 2, paddingBottom: space.sm },
  status: { fontFamily: font.bold, fontSize: 13 },
  ok: { color: color.okText },
  warn: { color: color.warnText },
  muted: { color: color.muted },
  hint: { ...type.meta, fontSize: 12 },
  input: {
    flex: 1,
    marginHorizontal: space.lg,
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    padding: space.md,
    ...type.body,
    color: color.ink,
  },
  warnLine: { ...type.body, fontSize: 13, color: color.warnText, paddingHorizontal: space.lg, paddingTop: space.sm },
  error: { ...type.body, color: color.danger, paddingHorizontal: space.lg, paddingTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md },
});

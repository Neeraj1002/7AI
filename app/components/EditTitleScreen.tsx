import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthedImageSource } from '../lib/use-authed-image';
import { pictureLink } from '../lib/packaging';
import {
  SAVE_BLOCKED_NOTE,
  SAVE_CHECKING_NOTE,
  counterText,
  highlightSegments,
  saveState,
  supportedFiguresOf,
  type Gate2Package,
  type TitleCheck,
} from '../lib/gate2-packaging';
import { color, font, radius, space, type } from '../lib/theme';

// Sprint 6 Task 1 (Gate 2 package screens, FE): the Edit title screen. The limit and every sentence come from the
// server (`titleLimit`, `runs.checkPackageTitle`); the app checks nothing itself. Save also chooses this package.

const DEBOUNCE_MS = 450;

export function EditTitleScreen({
  visible,
  pkg,
  index,
  initialTitle,
  titleLimit,
  checkTitle,
  saving,
  saveError,
  apiUrl,
  token,
  onClose,
  onSave,
}: {
  visible: boolean;
  pkg: Gate2Package | null;
  index: number;
  initialTitle: string;
  titleLimit: number;
  /** One server check of a title (`runs.checkPackageTitle`). */
  checkTitle: (title: string) => Promise<TitleCheck>;
  saving: boolean;
  /** The server's own refusal of the save, shown as sent. */
  saveError: string | null;
  apiUrl: string | null;
  token: string;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible && pkg ? (
        <Body
          pkg={pkg}
          index={index}
          initialTitle={initialTitle}
          titleLimit={titleLimit}
          checkTitle={checkTitle}
          saving={saving}
          saveError={saveError}
          apiUrl={apiUrl}
          token={token}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  );
}

function Body({
  pkg,
  index,
  initialTitle,
  titleLimit,
  checkTitle,
  saving,
  saveError,
  apiUrl,
  token,
  onClose,
  onSave,
}: Omit<Parameters<typeof EditTitleScreen>[0], 'visible' | 'pkg'> & { pkg: Gate2Package }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(initialTitle);
  const [result, setResult] = useState<{ title: string; check: TitleCheck } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const latest = useRef(0);
  const link = pkg.imageUrls ? pictureLink(pkg.imageUrls.feed, apiUrl) : null;
  const source = useAuthedImageSource(link?.url ?? null, token, link?.sendAuth ?? true);

  // The server's check on every pause in typing; an older answer never replaces a newer one.
  useEffect(() => {
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      checkTitle(title)
        .then((check) => {
          if (ticket === latest.current) setResult({ title, check });
        })
        .catch(() => {
          if (ticket === latest.current) setFailedFor(title);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title, checkTitle]);

  const state = saveState(result?.check ?? null, result?.title ?? null, title);
  const check = result && result.title === title ? result.check : null;
  const problems = check?.problems ?? [];
  const limit = check?.titleLimit ?? titleLimit;
  const tooLong = problems.some((p) => p.kind === 'too_long');
  const figures = supportedFiguresOf(problems);
  const segments = highlightSegments(title, problems);
  const blocked = state !== 'ready';
  const checkFailed = failedFor === title;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back without saving" style={styles.back}>
          <Feather name="chevron-left" size={26} color={color.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Edit title</Text>
          <Text style={styles.meta}>Package {index + 1} · the image stays the same</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.imageRow}>
          {source ? <Image source={source} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors /> : <View style={[styles.image, styles.blank]} />}
          <Text style={[styles.meta, { flex: 1, lineHeight: 18 }]}>Only the words change. The thumbnail you saw is the one that gets uploaded.</Text>
        </View>

        <View style={[styles.panel, blocked && state === 'blocked' && styles.panelBlocked]}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setTried(false);
            }}
            multiline
            editable={!saving}
            accessibilityLabel="Title"
            style={[styles.input, state === 'blocked' && styles.inputBlocked]}
          />
          <View style={styles.counterRow}>
            <View style={{ flex: 1 }} />
            <Text style={[styles.counter, tooLong && { color: color.danger }]}>{counterText(check?.length ?? title.trim().length, limit)}</Text>
          </View>
          {problems.map((p, i) => (
            <View key={`${p.kind}-${i}`} style={styles.problem}>
              <Feather name="alert-circle" size={20} color={color.danger} style={{ marginTop: 1 }} />
              <Text style={styles.problemText}>{p.message}</Text>
            </View>
          ))}
          {figures.length > 0 ? <Text style={styles.suggest}>The script does say: {figures.join(', ')}</Text> : null}
          {checkFailed ? <Text style={styles.suggest}>The check could not run. Try again in a moment.</Text> : null}
          <Text style={[styles.label, { marginTop: space.xs }]}>How it looks in the feed</Text>
          <Text style={styles.feed} numberOfLines={2}>
            {segments.map((s, i) => (
              <Text key={i} style={s.highlight ? styles.feedBad : undefined}>
                {s.text}
              </Text>
            ))}
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Pressable
            onPress={() => {
              if (state === 'ready') onSave(title.trim());
              else setTried(true);
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            style={[styles.save, blocked && styles.saveDim]}
          >
            {saving ? <ActivityIndicator color={color.onAccent} /> : <Text style={styles.saveText}>Save and choose this title</Text>}
          </Pressable>
          <Text style={styles.saveNote}>
            {saveError ?? (tried && state === 'blocked' ? SAVE_BLOCKED_NOTE : tried && state === 'checking' ? SAVE_CHECKING_NOTE : '')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingRight: space.lg, paddingVertical: space.xs },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: font.black, fontSize: 20, color: color.ink },
  meta: { ...type.meta },
  content: { gap: 14, paddingHorizontal: space.lg, paddingTop: space.sm },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  image: { width: 112, height: 63, borderRadius: 8 },
  blank: { backgroundColor: color.surface2 },
  panel: { gap: space.sm, padding: 14, borderRadius: radius.xl, borderWidth: 1.5, borderColor: color.ink },
  panelBlocked: { borderColor: color.ink },
  label: { fontFamily: font.bold, fontSize: 12, color: color.muted },
  input: { minHeight: 74, padding: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: color.ink, fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: color.ink, textAlignVertical: 'top' },
  inputBlocked: { borderColor: color.danger },
  counterRow: { flexDirection: 'row' },
  counter: { fontFamily: font.black, fontSize: 13, color: color.muted },
  problem: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: color.accentSoft },
  problemText: { flex: 1, fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.accentText },
  suggest: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  feed: { fontFamily: font.black, fontSize: 15, lineHeight: 20, color: color.ink },
  feedBad: { color: color.accentText, textDecorationLine: 'underline', backgroundColor: color.accentSoft },
  save: { height: 54, borderRadius: radius.lg, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  saveDim: { opacity: 0.4 },
  saveText: { fontFamily: font.black, fontSize: 16, color: color.onAccent },
  saveNote: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, textAlign: 'center', color: color.danger, minHeight: 18 },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  cancelText: { fontFamily: font.bold, fontSize: 14, color: color.muted },
});

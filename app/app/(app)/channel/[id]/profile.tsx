import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, BackHandler, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../../../lib/trpc';
import { useAuth } from '../../../../lib/auth';
import { useChannels } from '../../../../lib/channel-context';
import { useOptionLists } from '../../../../lib/pipeline-options';
import {
  buildProfileData,
  formsEqual,
  parseServerProfileError,
  profileToForm,
  type ProfileFieldKey,
  type ProfileForm,
} from '../../../../lib/profile-form';
import { color, font, radius, space, type } from '../../../../lib/theme';
import { FormScreen } from '../../../../components/FormScreen';
import { Card } from '../../../../components/Card';
import { BottomActionBar } from '../../../../components/BottomActionBar';
import { ConfirmSheet } from '../../../../components/ConfirmSheet';
import { OptionSheet } from '../../../../components/OptionSheet';
import { SegmentedControl } from '../../../../components/SegmentedControl';
import { PrimaryButton } from '../../../../components/Buttons';

const DEFAULT_HINT = 'Leave blank to use the default.';

// Sprint 4 FE E5 — the channel's Content profile. Fields are exactly `ChannelProfileDataSchema`; saving always
// creates a new version (`channels.createProfileVersion`), runs already started keep theirs.
export default function ContentProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { channelById } = useChannels();
  const channel = channelById(id);
  const { voices, visualSources, moodTags } = useOptionLists();

  const active = useQuery(trpc.channels.getActiveProfile.queryOptions({ channelId: id }));
  const versions = useQuery(trpc.channels.listProfileVersions.queryOptions({ channelId: id }));

  // The form is the server's active version until the user edits; `edits` holds the working copy.
  const baseline = useMemo(() => profileToForm(active.data?.data ?? null), [active.data]);
  const [edits, setEdits] = useState<ProfileForm | null>(null);
  const form = edits ?? baseline;
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);

  const dirty = edits !== null && !formsEqual(edits, baseline);
  const nextVersion = (versions.data?.[0]?.version ?? 0) + 1;
  const set = (key: ProfileFieldKey, value: string) => {
    setEdits((e) => ({ ...(e ?? baseline), [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    setSavedNote(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const built = buildProfileData(form);
      if (Object.keys(built.localErrors).length > 0) {
        const err = new Error('local');
        (err as Error & { local?: typeof built.localErrors }).local = built.localErrors;
        throw err;
      }
      // createProfileVersion takes `data: unknown` and validates it server-side.
      return trpcClientCreate(built.data);
    },
    onSuccess: async (row) => {
      setError(null);
      setFieldErrors({});
      setSavedNote(`Saved as v${row.version}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.channels.getActiveProfile.queryKey({ channelId: id }) }),
        queryClient.invalidateQueries({ queryKey: trpc.channels.listProfileVersions.queryKey({ channelId: id }) }),
      ]);
      // Only after the refetch, so the form never flashes the previous version.
      setEdits(null);
    },
    onError: (err) => {
      const local = (err as Error & { local?: Partial<Record<ProfileFieldKey, string>> }).local;
      if (local) {
        setFieldErrors(local);
        setError('Fix the highlighted fields.');
        return;
      }
      const parsed = parseServerProfileError(err instanceof Error ? err.message : 'Failed to save.');
      setFieldErrors(parsed.fields);
      setError(parsed.general ?? (Object.keys(parsed.fields).length > 0 ? 'Fix the highlighted fields.' : 'Failed to save.'));
    },
  });
  const createMutation = useMutation(trpc.channels.createProfileVersion.mutationOptions());
  const trpcClientCreate = (data: unknown) => createMutation.mutateAsync({ channelId: id, data });

  const goBack = () => {
    if (dirty) setDiscardOpen(true);
    else router.back();
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dirty) {
        setDiscardOpen(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dirty]);

  // Platform limits (read-only). The safety-negative line depends on the *resolved* visual source; the app only
  // knows the profile's own pick, so it is shown when that pick is ai-stills (blank = resolved server-side, not shown).
  const limits = useMemo(() => {
    const rows = ['Videos are 60 seconds at most.', 'AI-generated visuals are flagged as synthetic content on upload.'];
    if (form.defaultSource === 'ai-stills') {
      rows.push('Image prompts get a built-in safety negative prompt.');
    }
    return rows;
  }, [form.defaultSource]);

  if (!channel) {
    return (
      <FormScreen variant="stack" title="Content profile">
        <Text style={styles.body}>Channel not found.</Text>
      </FormScreen>
    );
  }

  const loading = active.isLoading;
  const voiceLabel = voices.find((v) => v.value === form.defaultVoice)?.label ?? 'Channel default';
  const moodLabel = moodTags.find((m) => m.value === form.defaultMoodTag)?.label ?? 'Auto';

  const footer = (
    <BottomActionBar onHeight={setBarHeight}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedNote ? <Text style={styles.saved}>{savedNote}</Text> : null}
      <Text style={styles.helper}>Saving creates a new version; runs already started keep theirs.</Text>
      <PrimaryButton
        label={`Save as v${nextVersion}`}
        onPress={() => save.mutate()}
        disabled={!dirty}
        loading={save.isPending}
      />
    </BottomActionBar>
  );

  return (
    <FormScreen
      variant="stack"
      title="Content profile"
      subtitle={channel.name}
      onBack={goBack}
      footer={footer}
      contentContainerStyle={[styles.content, { paddingBottom: barHeight + space.xl }]}
    >
      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : active.isError ? (
        <Text style={styles.error}>Couldn&apos;t load the profile. Go back and try again.</Text>
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitle}>Script</Text>
            <TextField label="Guide" hint={DEFAULT_HINT} value={form.guide} error={fieldErrors.guide} multiline
              placeholder="Tone, hooks, audience…" onChange={(v) => set('guide', v)} />
            <TextField label="Target length (seconds, 15–60)" hint={DEFAULT_HINT} value={form.targetSeconds}
              error={fieldErrors.targetSeconds} numeric onChange={(v) => set('targetSeconds', v)} />
            <TextField label="Banned openers (one per line)" hint={DEFAULT_HINT} value={form.bannedOpeners}
              error={fieldErrors.bannedOpeners} multiline onChange={(v) => set('bannedOpeners', v)} />
            <TextField label="Banned endings (one per line)" hint={DEFAULT_HINT} value={form.bannedEndings}
              error={fieldErrors.bannedEndings} multiline onChange={(v) => set('bannedEndings', v)} />
            <Text style={styles.label}>Fact policy</Text>
            <SegmentedControl
              options={[
                { value: '', label: 'Default' },
                { value: 'brief-only', label: 'Brief only' },
                { value: 'brief-plus-common', label: '+ Common' },
              ]}
              value={form.factPolicy}
              onChange={(v) => set('factPolicy', v)}
            />
            <FieldNote error={fieldErrors.factPolicy} hint={DEFAULT_HINT} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Visuals</Text>
            <Text style={styles.label}>Default visual source</Text>
            <SegmentedControl
              options={[{ value: '', label: 'Default' }, ...visualSources]}
              value={form.defaultSource}
              onChange={(v) => set('defaultSource', v)}
            />
            <FieldNote error={fieldErrors.defaultSource} hint={DEFAULT_HINT} />
            <TextField label="Style prompt" hint={DEFAULT_HINT} value={form.stylePrompt} error={fieldErrors.stylePrompt}
              multiline onChange={(v) => set('stylePrompt', v)} />
            <TextField label="Negative prompt" hint={DEFAULT_HINT} value={form.negativePrompt}
              error={fieldErrors.negativePrompt} multiline onChange={(v) => set('negativePrompt', v)} />
            <TextField label="Seconds per still (1–10)" hint={DEFAULT_HINT} value={form.secondsPerStill}
              error={fieldErrors.secondsPerStill} numeric onChange={(v) => set('secondsPerStill', v)} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Audio</Text>
            <PickerRow icon="mic" caption="Default voice" value={voiceLabel} onPress={() => setVoiceOpen(true)} />
            <FieldNote error={fieldErrors.defaultVoice} hint={DEFAULT_HINT} />
            <PickerRow icon="music" caption="Default music mood" value={moodLabel} onPress={() => setMoodOpen(true)} />
            <FieldNote error={fieldErrors.defaultMoodTag} hint={DEFAULT_HINT} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Packaging</Text>
            <TextField label="Title guidance" hint={DEFAULT_HINT} value={form.titleGuidance}
              error={fieldErrors.titleGuidance} multiline onChange={(v) => set('titleGuidance', v)} />
            <TextField label="Description template" value={form.descriptionTemplate}
              hint="Leave blank to use the default. Supports {summary} {sources} {editor} {hashtags}."
              error={fieldErrors.descriptionTemplate} multiline onChange={(v) => set('descriptionTemplate', v)} />
            <TextField label="Base hashtags" hint={DEFAULT_HINT} value={form.hashtagsBase}
              error={fieldErrors.hashtagsBase} onChange={(v) => set('hashtagsBase', v)} />
            <Text style={styles.label}>Credit the editor</Text>
            <SegmentedControl
              options={[{ value: '', label: 'Default' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={form.editorCredit}
              onChange={(v) => set('editorCredit', v)}
            />
            <FieldNote error={fieldErrors.editorCredit} hint={DEFAULT_HINT} />
            <Text style={styles.label}>Made for kids</Text>
            <SegmentedControl
              options={[{ value: '', label: 'Default' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={form.selfDeclaredMadeForKids}
              onChange={(v) => set('selfDeclaredMadeForKids', v)}
            />
            <FieldNote error={fieldErrors.selfDeclaredMadeForKids} hint="Leave blank — defaults to No." />
            <TextField label="YouTube category id" hint={DEFAULT_HINT} value={form.categoryId}
              error={fieldErrors.categoryId} onChange={(v) => set('categoryId', v)} />
            <TextField label="Language (e.g. en)" hint={DEFAULT_HINT} value={form.defaultLanguage}
              error={fieldErrors.defaultLanguage} onChange={(v) => set('defaultLanguage', v)} />
          </Card>

          <Card style={styles.limits}>
            <Text style={styles.cardTitle}>Platform limits</Text>
            {limits.map((row) => (
              <Text key={row} style={styles.limitRow}>
                {row}
              </Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Version history</Text>
            {versions.isLoading ? <ActivityIndicator /> : null}
            {versions.data?.length === 0 ? <Text style={styles.helper}>No versions yet.</Text> : null}
            {versions.data?.map((v) => (
              <View key={v.id} style={styles.versionRow}>
                <Text style={styles.versionNum}>v{v.version}</Text>
                <Text style={styles.versionMeta}>
                  {new Date(v.createdAt).toLocaleDateString()} ·{' '}
                  {v.createdByUserId === null ? 'system' : v.createdByUserId === userId ? 'you' : 'a teammate'}
                </Text>
                {active.data?.id === v.id ? <Text style={styles.activeTag}>Active</Text> : null}
              </View>
            ))}
          </Card>
        </>
      )}

      <OptionSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Default voice"
        options={[{ value: '', label: 'Channel default' }, ...voices]}
        selected={form.defaultVoice}
        onSelect={(v) => set('defaultVoice', v ?? '')}
      />
      <OptionSheet
        visible={moodOpen}
        onClose={() => setMoodOpen(false)}
        title="Default music mood"
        options={[{ value: '', label: 'Auto' }, ...moodTags]}
        selected={form.defaultMoodTag}
        onSelect={(v) => set('defaultMoodTag', v ?? '')}
      />
      <ConfirmSheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        icon="alert-triangle"
        title="Discard changes?"
        body="Your unsaved edits to this profile will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          router.back();
        }}
      />
    </FormScreen>
  );
}

function FieldNote({ error, hint }: { error?: string; hint: string }) {
  return <Text style={error ? styles.fieldError : styles.hint}>{error ?? hint}</Text>;
}

function TextField({
  label,
  hint,
  value,
  error,
  onChange,
  multiline,
  numeric,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        scrollEnabled={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize={numeric ? 'none' : 'sentences'}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
      />
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

function PickerRow({
  icon,
  caption,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  caption: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Feather name={icon} size={20} color={color.muted} />
      <View style={styles.rowText}>
        <Text style={styles.hint}>{caption}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={color.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  loading: { marginTop: space.xxl },
  body: { ...type.body, color: color.ink },
  cardTitle: { ...type.sectionTitle, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 14, color: color.ink, marginTop: space.sm },
  hint: { ...type.meta, fontSize: 12 },
  fieldError: { ...type.meta, fontSize: 12, color: color.danger },
  helper: { ...type.meta, fontSize: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginTop: space.xs,
    ...type.body,
    color: color.ink,
  },
  inputError: { borderColor: color.danger },
  multiline: { minHeight: 84, maxHeight: 200, textAlignVertical: 'top' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: color.future,
    borderRadius: radius.lg,
  },
  rowText: { flex: 1 },
  rowValue: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  limits: { backgroundColor: color.surface2 },
  limitRow: { ...type.meta, color: color.muted },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  versionNum: { fontFamily: font.bold, fontSize: 14, color: color.ink, width: 36 },
  versionMeta: { ...type.meta, flex: 1 },
  activeTag: { ...type.meta, fontFamily: font.bold, color: color.okText },
  error: { ...type.body, color: color.danger },
  saved: { ...type.meta, color: color.okText },
});

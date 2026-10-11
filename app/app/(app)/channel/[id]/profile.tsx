import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, BackHandler, ActivityIndicator, Switch } from 'react-native';
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
import { PrimaryButton } from '../../../../components/Buttons';

const FACT_POLICIES = [
  { value: 'brief-only', label: 'Brief only' },
  { value: 'brief-plus-common', label: 'Brief plus common knowledge' },
];

type SheetName = 'voice' | 'mood' | 'source' | 'fact' | null;

// Sprint 4 FE E5 — the channel's Content profile (board "Content profile — full screen"). Fields are exactly
// `ChannelProfileDataSchema`; saving always creates a new version (`channels.createProfileVersion`), and runs
// already started keep theirs. Blank = "leave blank to use the default".
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
  const createVersion = useMutation(trpc.channels.createProfileVersion.mutationOptions());

  // The form is the server's active version until the user edits; `edits` holds the working copy.
  const baseline = useMemo(() => profileToForm(active.data?.data ?? null), [active.data]);
  const [edits, setEdits] = useState<ProfileForm | null>(null);
  const form = edits ?? baseline;
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);

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
      // `data` is validated server-side (Zod); its message comes back per field.
      return createVersion.mutateAsync({ channelId: id, data: built.data });
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

  if (!channel) {
    return (
      <FormScreen variant="stack" title="Content profile">
        <Text style={styles.body}>Channel not found.</Text>
      </FormScreen>
    );
  }

  const loading = active.isLoading;
  const subtitle = active.data ? `${channel.name} · v${active.data.version} active` : channel.name;
  const labelOf = (list: { value: string; label: string }[], v: string, fallback: string) =>
    list.find((o) => o.value === v)?.label ?? fallback;

  const footer = (
    <BottomActionBar onHeight={setBarHeight}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {savedNote ? <Text style={styles.saved}>{savedNote}</Text> : null}
      <PrimaryButton label={`Save as v${nextVersion}`} onPress={() => save.mutate()} disabled={!dirty} loading={save.isPending} />
      <Text style={styles.helper}>Saving creates a new version; runs already started keep theirs.</Text>
    </BottomActionBar>
  );

  return (
    <FormScreen
      variant="stack"
      title="Content profile"
      subtitle={subtitle}
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
          <Text style={styles.intro}>Applies to new runs on {channel.name}. Every field is optional.</Text>

          <Card>
            <Text style={styles.cardTitle}>Script</Text>
            <TextField label="Script guide" value={form.guide} error={fieldErrors.guide} multiline
              placeholder="Tone, audience, how hooks should sound…" onChange={(v) => set('guide', v)} />
            <TextField label="Target length (15–60 s)" value={form.targetSeconds} error={fieldErrors.targetSeconds}
              numeric onChange={(v) => set('targetSeconds', v)} />
            <TextField label="Banned openers" note="one per line" value={form.bannedOpeners} error={fieldErrors.bannedOpeners}
              multiline onChange={(v) => set('bannedOpeners', v)} />
            <TextField label="Banned endings" note="one per line" value={form.bannedEndings} error={fieldErrors.bannedEndings}
              multiline onChange={(v) => set('bannedEndings', v)} />
            <SelectField label="Fact policy" value={labelOf(FACT_POLICIES, form.factPolicy, '')} error={fieldErrors.factPolicy}
              onPress={() => setSheet('fact')} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Visuals</Text>
            <SelectField label="Default visual source" value={labelOf(visualSources, form.defaultSource, '')}
              error={fieldErrors.defaultSource} onPress={() => setSheet('source')} />
            <TextField label="Style prompt" value={form.stylePrompt} error={fieldErrors.stylePrompt} multiline
              onChange={(v) => set('stylePrompt', v)} />
            <TextField label="Negative prompt" value={form.negativePrompt} error={fieldErrors.negativePrompt} multiline
              onChange={(v) => set('negativePrompt', v)} />
            <TextField label="Seconds per still (1–10)" value={form.secondsPerStill} error={fieldErrors.secondsPerStill}
              numeric onChange={(v) => set('secondsPerStill', v)} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Audio</Text>
            <SelectField label="Default voice" value={labelOf(voices, form.defaultVoice, '')} error={fieldErrors.defaultVoice}
              onPress={() => setSheet('voice')} />
            <SelectField label="Music mood" value={labelOf(moodTags, form.defaultMoodTag, '')} error={fieldErrors.defaultMoodTag}
              onPress={() => setSheet('mood')} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Packaging</Text>
            <TextField label="Title guidance" value={form.titleGuidance} error={fieldErrors.titleGuidance} multiline
              onChange={(v) => set('titleGuidance', v)} />
            <TextField label="Description template" value={form.descriptionTemplate} error={fieldErrors.descriptionTemplate}
              multiline placeholder="Supports {summary} {sources} {editor} {hashtags}" onChange={(v) => set('descriptionTemplate', v)} />
            <TextField label="Base hashtags" value={form.hashtagsBase} error={fieldErrors.hashtagsBase}
              onChange={(v) => set('hashtagsBase', v)} />
            <SwitchRow label="Editor credit in description" value={form.editorCredit === 'yes'} error={fieldErrors.editorCredit}
              onChange={(on) => set('editorCredit', on ? 'yes' : 'no')} />
            <SwitchRow label="Made for kids" note="defaults to No" value={form.selfDeclaredMadeForKids === 'yes'}
              error={fieldErrors.selfDeclaredMadeForKids} onChange={(on) => set('selfDeclaredMadeForKids', on ? 'yes' : 'no')} />
            <TextField label="Category (YouTube id, e.g. 27)" value={form.categoryId} error={fieldErrors.categoryId}
              onChange={(v) => set('categoryId', v)} />
            <TextField label="Default language (e.g. en)" value={form.defaultLanguage} error={fieldErrors.defaultLanguage}
              onChange={(v) => set('defaultLanguage', v)} />
          </Card>

          <Card style={styles.limits}>
            <Text style={styles.cardTitle}>🔒 Platform limits (not editable)</Text>
            <Text style={styles.limitRow}>• Max length 60 s</Text>
            <Text style={styles.limitRow}>• AI-generated visuals are flagged as synthetic content on upload</Text>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Version history</Text>
            {versions.isLoading ? <ActivityIndicator /> : null}
            {versions.data?.length === 0 ? <Text style={styles.helper}>No versions yet.</Text> : null}
            {versions.data?.map((v) => (
              <View key={v.id} style={styles.versionRow}>
                <Text style={styles.versionNum}>v{v.version}</Text>
                <Text style={styles.versionMeta}>
                  {new Date(v.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ·{' '}
                  {v.createdByUserId === null ? 'system' : v.createdByUserId === userId ? 'you' : 'a teammate'}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <OptionSheet
        visible={sheet === 'voice'}
        onClose={() => setSheet(null)}
        title="Default voice"
        options={[{ value: '', label: 'Leave blank (channel default)' }, ...voices]}
        selected={form.defaultVoice}
        onSelect={(v) => set('defaultVoice', v ?? '')}
      />
      <OptionSheet
        visible={sheet === 'mood'}
        onClose={() => setSheet(null)}
        title="Music mood"
        options={[{ value: '', label: 'Leave blank (auto)' }, ...moodTags]}
        selected={form.defaultMoodTag}
        onSelect={(v) => set('defaultMoodTag', v ?? '')}
      />
      <OptionSheet
        visible={sheet === 'source'}
        onClose={() => setSheet(null)}
        title="Default visual source"
        options={[{ value: '', label: 'Leave blank (auto)' }, ...visualSources]}
        selected={form.defaultSource}
        onSelect={(v) => set('defaultSource', v ?? '')}
      />
      <OptionSheet
        visible={sheet === 'fact'}
        onClose={() => setSheet(null)}
        title="Fact policy"
        options={[{ value: '', label: 'Leave blank (default)' }, ...FACT_POLICIES]}
        selected={form.factPolicy}
        onSelect={(v) => set('factPolicy', v ?? '')}
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

// "Label · leave blank to use the default" — the board's inline hint.
function FieldLabel({ label, note }: { label: string; note?: string }) {
  return (
    <Text style={styles.label}>
      {label} <Text style={styles.labelNote}>· {note ? `${note} · ` : ''}leave blank to use the default</Text>
    </Text>
  );
}

function ErrorLine({ error }: { error?: string }) {
  return error ? <Text style={styles.fieldError}>{error}</Text> : null;
}

function TextField({
  label,
  note,
  value,
  error,
  onChange,
  multiline,
  numeric,
  placeholder,
}: {
  label: string;
  note?: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} note={note} />
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
      <ErrorLine error={error} />
    </View>
  );
}

function SelectField({ label, value, error, onPress }: { label: string; value: string; error?: string; onPress: () => void }) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <Pressable style={[styles.input, styles.select, error ? styles.inputError : null]} onPress={onPress} accessibilityRole="button">
        <Text style={[styles.selectText, !value && styles.selectEmpty]} numberOfLines={1}>
          {value || 'Not set'}
        </Text>
        <Feather name="chevron-down" size={18} color={color.muted} />
      </Pressable>
      <ErrorLine error={error} />
    </View>
  );
}

function SwitchRow({
  label,
  note,
  value,
  error,
  onChange,
}: {
  label: string;
  note?: string;
  value: boolean;
  error?: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>
          {label}
          {note ? <Text style={styles.labelNote}> · {note}</Text> : null}
        </Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: color.okText, false: color.future }} thumbColor={color.bg} />
      </View>
      <ErrorLine error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  loading: { marginTop: space.xxl },
  body: { ...type.body, color: color.ink },
  intro: { ...type.meta, fontSize: 13 },
  cardTitle: { fontFamily: font.black, fontSize: 15, color: color.ink },
  field: { gap: 4 },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  labelNote: { fontFamily: font.regular, color: color.muted },
  helper: { ...type.meta, fontSize: 13, lineHeight: 19 },
  fieldError: { ...type.meta, fontSize: 12, color: color.danger },
  input: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.ink,
  },
  inputError: { borderColor: color.danger },
  multiline: { minHeight: 72, maxHeight: 200, textAlignVertical: 'top' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  selectText: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink },
  selectEmpty: { color: color.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  switchLabel: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  limits: { backgroundColor: color.surface2, borderWidth: 0 },
  limitRow: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  versionNum: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  versionMeta: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  error: { ...type.body, color: color.danger },
  saved: { ...type.meta, color: color.okText },
});

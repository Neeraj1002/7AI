import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { VoiceSheet } from './VoiceSheet';
import { useOptionLists } from '../lib/pipeline-options';
import { useTRPCClient } from '../lib/trpc';
import { newLimitError, parseLimit, usd } from '../lib/long-video';
import {
  changeLines,
  diffSettings,
  lockedSettings,
  missingProcedure,
  redoesWork,
  refusedChanges,
  settingRules,
  SETTING_LABEL,
  type SettingKey,
  type SettingRule,
  type SettingsChange,
} from '../lib/run-settings';
import { color, font, radius, space, type } from '../lib/theme';

export type CurrentSettings = {
  voice: string | null;
  audioLayer: string | null;
  visualSource: string | null;
  privacyStatus: 'private' | 'unlisted' | 'public';
  maxCostUsd: number | null;
};

const PRIVACY: { value: CurrentSettings['privacyStatus']; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'public', label: 'Public' },
];

// The call may not exist on an older server; the client throws "No procedure found" then.
type UpdateClient = { runs: { updateSettings: { mutate: (input: { runId: string } & SettingsChange) => Promise<unknown> } } };

// Sprint 5 Task 7 R4 — "Edit settings" on a stopped or waiting run. Lists only what can change at this point (D1), says
// what a change would redo, keeps the approved script, the money spent and every finished step, and does not restart
// from the first stage. "Save and retry this step" saves the change and reruns the stopped step.
export function EditSettingsSheet({
  visible,
  onClose,
  runId,
  status,
  stages,
  current,
  spentUsd,
  channelDefaultVoice,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  runId: string;
  status: string;
  stages: readonly { stageName: string; status: string }[];
  current: CurrentSettings;
  spentUsd: number;
  channelDefaultVoice: string;
  /** Called after a successful save; `retried` is true when the stopped step was started again. */
  onDone: (result: { retried: boolean; lines: string[] }) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible ? (
        <Body
          onClose={onClose}
          runId={runId}
          status={status}
          stages={stages}
          current={current}
          spentUsd={spentUsd}
          channelDefaultVoice={channelDefaultVoice}
          onDone={onDone}
        />
      ) : null}
    </BottomSheet>
  );
}

function Body({ onClose, runId, status, stages, current, spentUsd, channelDefaultVoice, onDone }: Omit<Parameters<typeof EditSettingsSheet>[0], 'visible'>) {
  const client = useTRPCClient();
  const { voices, visualSources, moodTags } = useOptionLists();
  const rules = settingRules({ status, stages });
  const ruleOf = (key: SettingKey) => rules.find((r) => r.key === key)!;

  const [draft, setDraft] = useState<CurrentSettings>(current);
  const [spendText, setSpendText] = useState(current.maxCostUsd !== null ? String(current.maxCostUsd) : '');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spendChanged = spendText.trim() !== (current.maxCostUsd !== null ? String(current.maxCostUsd) : '');
  const spendError = spendChanged ? newLimitError(spendText, spentUsd) : null;
  const next: SettingsChange = {
    voice: draft.voice,
    audioLayer: draft.audioLayer,
    visualSource: draft.visualSource,
    privacyStatus: draft.privacyStatus,
    ...(spendChanged && parseLimit(spendText) !== null ? { maxCostUsd: parseLimit(spendText)! } : {}),
  };
  const change = diffSettings(
    { voice: current.voice, audioLayer: current.audioLayer, visualSource: current.visualSource, privacyStatus: current.privacyStatus, maxCostUsd: current.maxCostUsd ?? undefined },
    next,
  );
  const hasChange = Object.keys(change).length > 0;
  const redo = redoesWork(change, rules);
  const retries = status === 'needs_attention';

  const labelOf = (list: { value: string; label: string }[], v: string | null, fallback: string) => (v ? (list.find((o) => o.value === v)?.label ?? v) : fallback);
  const label = {
    voice: (v: string | null) => labelOf(voices, v, `Channel default (${channelDefaultVoice})`),
    audioLayer: (v: string | null) => labelOf(moodTags, v, 'Auto'),
    visualSource: (v: string | null) => labelOf(visualSources, v, 'Channel default'),
  };

  const save = async () => {
    const refused = refusedChanges(change, rules);
    if (refused.length > 0) {
      setError(refused.join(' '));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await (client as unknown as UpdateClient).runs.updateSettings.mutate({ runId, ...change });
      if (retries) await client.runs.retry.mutate({ runId });
      const from = {
        voice: label.voice(current.voice),
        audioLayer: label.audioLayer(current.audioLayer),
        visualSource: label.visualSource(current.visualSource),
        privacyStatus: PRIVACY.find((p) => p.value === current.privacyStatus)?.label ?? current.privacyStatus,
        maxCostUsd: current.maxCostUsd !== null ? usd(current.maxCostUsd) : 'no limit',
      };
      const to = {
        voice: label.voice(draft.voice),
        audioLayer: label.audioLayer(draft.audioLayer),
        visualSource: label.visualSource(draft.visualSource),
        privacyStatus: PRIVACY.find((p) => p.value === draft.privacyStatus)?.label ?? draft.privacyStatus,
        maxCostUsd: change.maxCostUsd !== undefined ? usd(change.maxCostUsd) : from.maxCostUsd,
      };
      onDone({ retried: retries, lines: changeLines(from, to, change) });
      onClose();
    } catch (e) {
      // The server's own words (a failed preflight check says which setting to change); a server without the call says so.
      setError(missingProcedure(e) ? 'This server cannot change settings on a run yet.' : e instanceof Error ? e.message : 'Could not save the settings.');
    } finally {
      setPending(false);
    }
  };

  const modeNote = (r: SettingRule) => (r.mode === 'revision' ? `Redoes finished work. ${r.note}` : r.note);

  return (
    <>
      <Text style={styles.title}>Edit settings</Text>
      <Text style={styles.intro}>The approved script, the money already spent and every finished step are kept. This does not start the run over.</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <Field label={SETTING_LABEL.voice} note={modeNote(ruleOf('voice'))} revision={ruleOf('voice').mode === 'revision'}>
          <Pressable onPress={() => setVoiceOpen(true)} style={styles.select} accessibilityRole="button" accessibilityLabel={`Voice: ${label.voice(draft.voice)}`}>
            <Text style={styles.selectText} numberOfLines={1}>
              {label.voice(draft.voice)}
            </Text>
            <Feather name="chevron-down" size={18} color={color.ink} />
          </Pressable>
        </Field>

        <Field label={SETTING_LABEL.audioLayer} note={modeNote(ruleOf('audioLayer'))} revision={ruleOf('audioLayer').mode === 'revision'}>
          <Chips options={moodTags} value={draft.audioLayer} onChange={(v) => setDraft((d) => ({ ...d, audioLayer: v }))} />
        </Field>

        <Field label={SETTING_LABEL.visualSource} note={modeNote(ruleOf('visualSource'))} revision={ruleOf('visualSource').mode === 'revision'}>
          <Chips options={visualSources} value={draft.visualSource} onChange={(v) => setDraft((d) => ({ ...d, visualSource: v }))} />
        </Field>

        <Field label={SETTING_LABEL.privacyStatus} note={modeNote(ruleOf('privacyStatus'))}>
          <Chips
            options={PRIVACY}
            value={draft.privacyStatus}
            onChange={(v) => setDraft((d) => ({ ...d, privacyStatus: v as CurrentSettings['privacyStatus'] }))}
          />
        </Field>

        <Field label={SETTING_LABEL.maxCostUsd} note={`${modeNote(ruleOf('maxCostUsd'))} Spent so far: ${usd(spentUsd)}.`}>
          <View style={[styles.spend, spendError ? styles.spendError : null]}>
            <Text style={styles.prefix}>$</Text>
            <TextInput
              style={styles.input}
              value={spendText}
              onChangeText={setSpendText}
              keyboardType="decimal-pad"
              selectionColor={color.accent}
              cursorColor={color.accent}
              accessibilityLabel="Max spend for this video, in dollars"
            />
          </View>
          {spendError ? <Text style={styles.error}>{spendError}</Text> : null}
        </Field>

        {lockedSettings().map((l) => (
          <View key={l.label} style={styles.locked}>
            <Feather name="lock" size={14} color={color.muted} />
            <Text style={styles.lockedText}>
              <Text style={styles.lockedLabel}>{l.label}: </Text>
              unavailable. {l.reason}
            </Text>
          </View>
        ))}
      </ScrollView>

      {redo.length > 0 ? <Text style={styles.warn}>This redoes finished work: {redo.map((r) => r.label.toLowerCase()).join(', ')}. It may cost more.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={retries ? 'Save and retry this step' : 'Save settings'}
        loading={pending}
        disabled={!hasChange || spendError !== null}
        onPress={() => void save()}
      />
      <SecondaryButton label="Cancel" onPress={onClose} disabled={pending} />

      <VoiceSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title="Voice"
        defaultLabel={`Channel default (${channelDefaultVoice})`}
        selected={draft.voice}
        onSelect={(v) => setDraft((d) => ({ ...d, voice: v }))}
      />
    </>
  );
}

function Field({ label, note, revision, children }: { label: string; note: string; revision?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <Text style={[styles.note, revision && styles.noteRevision]}>{note}</Text>
    </View>
  );
}

function Chips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipActive]}>
            {active ? <Feather name="check" size={13} color={color.onAccent} style={styles.check} /> : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.stackTitle, color: color.ink },
  intro: { ...type.meta, fontSize: 12, lineHeight: 17 },
  list: { maxHeight: 420 },
  listContent: { gap: space.md, paddingBottom: space.sm },
  field: { gap: 6 },
  label: { fontFamily: font.bold, fontSize: 13, color: color.ink },
  note: { ...type.meta, fontSize: 12, lineHeight: 17 },
  noteRevision: { color: color.warnText },
  select: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.ink },
  selectText: { fontFamily: font.semibold, fontSize: 15, color: color.ink, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: color.future },
  chipActive: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: color.ink },
  chipTextActive: { fontFamily: font.black, color: color.onAccent },
  check: { marginRight: 4 },
  spend: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.ink },
  spendError: { borderColor: color.danger },
  prefix: { fontFamily: font.bold, fontSize: 16, color: color.ink, marginRight: 4 },
  input: { flex: 1, minHeight: 44, fontFamily: font.semibold, fontSize: 16, color: color.ink, padding: 0 },
  locked: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lockedText: { ...type.meta, fontSize: 12, lineHeight: 17, flex: 1 },
  lockedLabel: { fontFamily: font.bold, color: color.muted },
  warn: { ...type.body, fontSize: 13, color: color.warnText },
  error: { ...type.body, fontSize: 13, color: color.danger },
});

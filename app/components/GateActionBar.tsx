import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { ConfirmSheet } from './ConfirmSheet';
import { DangerTextButton, PrimaryButton, SecondaryButton } from './Buttons';
import { flags } from '../lib/feature-flags';
import { color, font, radius, space, type } from '../lib/theme';

export type Privacy = 'private' | 'unlisted' | 'public';
type Mode = 'reject' | 'edit' | null;

const PRIVACY_OPTIONS: { value: Privacy; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'public', label: 'Public' },
];
const PRIVACY_HINT: Record<Privacy, string> = {
  private: 'Only you can see it on YouTube.',
  unlisted: 'Anyone with the link can watch it.',
  public: 'Goes live for everyone as soon as it uploads.',
};

// Approve / Reject / Edit-or-Revise for either gate. Reject and Edit/Revise
// open a bottom sheet for text entry (rises above the keyboard). Used by Run
// detail (inside a BottomActionBar) and by the Inbox.
export function GateActionBar(props: {
  gate: 1 | 2;
  isSubmitting: boolean;
  initialEditText?: string;
  defaultPrivacy?: Privacy;
  onApprove: (privacy?: Privacy) => void;
  onReject: (reason: string) => void;
  onEditOrRevise: (text: string) => void;
  // Bugs Task 12 (R2): at the manual Revise cap the button stays visible but disabled, with this sentence under it.
  reviseDisabledReason?: string;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [privacy, setPrivacy] = useState<Privacy>(props.defaultPrivacy ?? 'private');
  const [confirmPublic, setConfirmPublic] = useState(false);
  const showVisibility = props.gate === 2 && flags.gate2Visibility;
  const effective: Privacy = showVisibility ? privacy : 'private';

  if (props.isSubmitting) {
    return (
      <View style={styles.submitting}>
        <ActivityIndicator />
        <Text style={styles.submittingText}>Submitting decision…</Text>
      </View>
    );
  }

  const approveLabel =
    props.gate === 1
      ? 'Approve' // U6: 'Approve script' broke mid-word beside Reject and Edit on the Inbox card
      : effective === 'public'
        ? 'Approve & publish publicly'
        : `Approve & upload as ${effective}`;

  const handleApprove = () => {
    if (props.gate === 2 && effective === 'public') setConfirmPublic(true);
    else props.onApprove(showVisibility ? effective : undefined);
  };

  return (
    <View style={styles.wrap}>
      {showVisibility ? (
        <View style={styles.visibility}>
          <Text style={styles.visibilityLabel}>YouTube visibility</Text>
          <View style={styles.segment}>
            {PRIVACY_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setPrivacy(o.value)}
                style={[styles.segmentItem, privacy === o.value && styles.segmentItemActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: privacy === o.value }}
              >
                <Text style={[styles.segmentText, privacy === o.value && styles.segmentTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, privacy === 'public' && styles.hintWarn]}>{PRIVACY_HINT[privacy]}</Text>
        </View>
      ) : null}

      {props.gate === 1 ? (
        <View style={styles.row}>
          <DangerTextButton label="Reject" icon="x" onPress={() => setMode('reject')} />
          <SecondaryButton label="Edit" icon="edit-2" onPress={() => setMode('edit')} />
          <PrimaryButton label={approveLabel} icon="check" onPress={handleApprove} style={styles.flex} />
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <SecondaryButton label="Reject" icon="x" onPress={() => setMode('reject')} style={styles.flex} />
            <SecondaryButton
              label="Revise"
              icon="rotate-cw"
              disabled={Boolean(props.reviseDisabledReason)}
              onPress={() => setMode('edit')}
              style={styles.flex}
            />
          </View>
          {props.reviseDisabledReason ? <Text style={styles.hint}>{props.reviseDisabledReason}</Text> : null}
          <PrimaryButton label={approveLabel} icon="arrow-up" onPress={handleApprove} />
        </>
      )}

      <TextEntrySheet
        visible={mode !== null}
        title={
          mode === 'reject' ? 'Reason for rejection' : props.gate === 1 ? 'Edited script text' : 'Revision notes'
        }
        initialText={mode === 'edit' && props.gate === 1 ? (props.initialEditText ?? '') : ''}
        placeholder={mode === 'reject' ? 'Why is this being rejected?' : 'Enter text…'}
        submitLabel={mode === 'reject' ? 'Reject' : props.gate === 1 ? 'Save edit' : 'Send revision'}
        onClose={() => setMode(null)}
        onSubmit={(text) => {
          const m = mode;
          setMode(null);
          if (m === 'reject') props.onReject(text);
          else props.onEditOrRevise(text);
        }}
      />

      <ConfirmSheet
        visible={confirmPublic}
        onClose={() => setConfirmPublic(false)}
        icon="arrow-up"
        title="Publish publicly?"
        body="It goes live on the channel for everyone as soon as it uploads."
        confirmLabel="Publish"
        onConfirm={() => {
          setConfirmPublic(false);
          props.onApprove('public');
        }}
      />
    </View>
  );
}

function TextEntrySheet(props: {
  visible: boolean;
  title: string;
  initialText: string;
  placeholder: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      {/* remounted per open so the initial text is re-applied */}
      {props.visible ? <TextEntryBody {...props} /> : null}
    </BottomSheet>
  );
}

function TextEntryBody({ title, initialText, placeholder, submitLabel, onClose, onSubmit }: Parameters<typeof TextEntrySheet>[0]) {
  const [text, setText] = useState(initialText);
  return (
    <>
      <Text style={styles.sheetTitle}>{title}</Text>
      <TextInput
        selectionColor={color.accent}
        cursorColor={color.accent}
        style={styles.sheetInput}
        value={text}
        onChangeText={setText}
        multiline
        scrollEnabled
        autoFocus
        placeholder={placeholder}
        placeholderTextColor={color.muted}
      />
      <View style={styles.row}>
        <SecondaryButton label="Cancel" onPress={onClose} style={styles.flex} />
        <PrimaryButton
          label={submitLabel}
          disabled={!text.trim()}
          onPress={() => onSubmit(text.trim())}
          style={styles.flex}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  flex: { flex: 1 },
  submitting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', padding: space.md },
  submittingText: { ...type.meta },
  visibility: { gap: 6 },
  visibilityLabel: { fontFamily: font.bold, fontSize: 12, color: color.muted, textTransform: 'uppercase' },
  segment: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: color.bg },
  segmentText: { fontFamily: font.semibold, fontSize: 14, color: color.muted },
  segmentTextActive: { color: color.ink },
  hint: { ...type.meta, fontSize: 12 },
  hintWarn: { color: color.warnText },
  sheetTitle: { ...type.stackTitle, color: color.ink },
  sheetInput: {
    borderWidth: 2,
    borderColor: color.inputBorder,
    borderRadius: radius.lg,
    padding: space.md,
    minHeight: 120,
    maxHeight: 220,
    textAlignVertical: 'top',
    ...type.body,
    color: color.ink,
  },
});

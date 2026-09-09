import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

type Mode = 'idle' | 'reject' | 'edit';

// The unified three-action pattern task2.md asks both gate sections to share:
// Approve / Reject (with a reason) / Edit-or-Revise (opens a text field).
// `editFieldLabel` and the outcome of `onEditOrRevise` are the only things
// that differ between Gate 1 (free text becomes the new sanctioned script —
// agents/gate1's parseGateReply treats any non-approve/non-reject reply this
// way, there's no separate "notes" payload shape server-side) and Gate 2
// (free text is always revision notes, since a video can't be hand-edited).
export function GateActionBar(props: {
  editFieldLabel: string;
  isSubmitting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onEditOrRevise: (text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');

  if (props.isSubmitting) {
    return (
      <View style={styles.submitting}>
        <ActivityIndicator />
        <Text style={styles.submittingText}>Submitting decision…</Text>
      </View>
    );
  }

  if (mode === 'idle') {
    return (
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.approve]} onPress={props.onApprove}>
          <Text style={styles.buttonTextLight}>Approve</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.reject]} onPress={() => setMode('reject')}>
          <Text style={styles.buttonTextLight}>Reject</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.edit]} onPress={() => setMode('edit')}>
          <Text style={styles.buttonTextDark}>Edit / Revise</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetLabel}>{mode === 'reject' ? 'Reason for rejection' : props.editFieldLabel}</Text>
      <TextInput
        style={styles.sheetInput}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={mode === 'reject' ? 'Why is this being rejected?' : 'Enter text…'}
      />
      <View style={styles.row}>
        <Pressable
          style={[styles.button, styles.cancel]}
          onPress={() => {
            setMode('idle');
            setText('');
          }}
        >
          <Text style={styles.buttonTextDark}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.confirm]}
          onPress={() => {
            if (!text.trim()) return;
            if (mode === 'reject') props.onReject(text.trim());
            else props.onEditOrRevise(text.trim());
            setText('');
            setMode('idle');
          }}
        >
          <Text style={styles.buttonTextLight}>Submit</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  approve: { backgroundColor: '#1a7f37' },
  reject: { backgroundColor: '#c0392b' },
  edit: { backgroundColor: '#eee' },
  cancel: { backgroundColor: '#eee' },
  confirm: { backgroundColor: '#111' },
  buttonTextLight: { color: '#fff', fontWeight: '700', fontSize: 14 },
  buttonTextDark: { color: '#111', fontWeight: '700', fontSize: 14 },
  sheet: { gap: 10 },
  sheetLabel: { fontSize: 13, fontWeight: '600' },
  sheetInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  submitting: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', padding: 12 },
  submittingText: { color: '#666' },
});

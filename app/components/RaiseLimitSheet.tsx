import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { DangerOutlineButton, PrimaryButton } from './Buttons';
import { newLimitError, parseLimit, usd } from '../lib/long-video';
import { color, font, radius, space, type } from '../lib/theme';

// Sprint 4 FE N3 R2.8 — a long run stopped at its spend limit. Retry would stop again at once, so this sheet asks for a
// higher limit and sends it with runs.retry. Opened only from the two numbers (spentUsd >= maxCostUsd). Any server
// error (weekly budget, the absolute cap) shows under the field in the server's words.
export function RaiseLimitSheet({
  visible,
  onClose,
  spentUsd,
  maxCostUsd,
  pending,
  serverError,
  onContinue,
  onCancelRun,
}: {
  visible: boolean;
  onClose: () => void;
  spentUsd: number;
  maxCostUsd: number;
  pending: boolean;
  serverError: string | null;
  onContinue: (maxCostUsd: number) => void;
  onCancelRun: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* remounted per open so the field starts empty */}
      {visible ? (
        <Body
          spentUsd={spentUsd}
          maxCostUsd={maxCostUsd}
          pending={pending}
          serverError={serverError}
          onContinue={onContinue}
          onCancelRun={onCancelRun}
        />
      ) : null}
    </BottomSheet>
  );
}

function Body({
  spentUsd,
  maxCostUsd,
  pending,
  serverError,
  onContinue,
  onCancelRun,
}: Omit<Parameters<typeof RaiseLimitSheet>[0], 'visible' | 'onClose'>) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const localError = newLimitError(text, spentUsd);
  const shown = serverError ?? (touched ? localError : null);
  const value = parseLimit(text);
  return (
    <>
      <Text style={styles.title}>Raise the spend limit</Text>
      <Text style={styles.body}>
        This video has spent {usd(spentUsd)} of its {usd(maxCostUsd)} limit. Enter a new limit to continue.
      </Text>
      <View style={[styles.field, shown ? styles.fieldError : null]}>
        <Text style={styles.prefix}>$</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setTouched(true);
          }}
          keyboardType="decimal-pad"
          autoFocus
          selectionColor={color.accent}
          cursorColor={color.accent}
          accessibilityLabel="New spend limit, in dollars"
        />
      </View>
      {shown ? <Text style={styles.error}>{shown}</Text> : null}
      <PrimaryButton
        label="Continue"
        loading={pending}
        disabled={localError !== null || value === null}
        onPress={() => value !== null && onContinue(value)}
      />
      <DangerOutlineButton label="Cancel run" icon="x" disabled={pending} onPress={onCancelRun} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...type.stackTitle, color: color.ink },
  body: { ...type.body, color: color.ink },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.ink,
  },
  fieldError: { borderWidth: 2, borderColor: color.danger },
  prefix: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  input: { flex: 1, paddingVertical: space.sm, fontFamily: font.bold, fontSize: 15, color: color.ink },
  error: { ...type.meta, fontSize: 12, lineHeight: 17, color: color.danger },
});

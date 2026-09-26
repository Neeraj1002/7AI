import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { color, radius, space, type } from '../lib/theme';

export function ConfirmSheet({
  visible,
  onClose,
  icon,
  title,
  body,
  warning,
  confirmLabel,
  destructive,
  onConfirm,
  isConfirming,
}: {
  visible: boolean;
  onClose: () => void;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  warning?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  isConfirming?: boolean;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.iconTile}>
        <Feather name={icon} size={22} color={destructive ? color.danger : color.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {warning ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <SecondaryButton label="Cancel" onPress={onClose} style={styles.flex} />
        {destructive ? (
          <PrimaryButton
            label={confirmLabel}
            onPress={onConfirm}
            loading={isConfirming}
            style={[styles.flex, styles.dangerButton]}
          />
        ) : (
          <PrimaryButton label={confirmLabel} onPress={onConfirm} loading={isConfirming} style={styles.flex} />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.stackTitle, color: color.ink },
  body: { ...type.body, color: color.muted },
  warningBox: { backgroundColor: color.warnBg, borderRadius: radius.md, padding: space.md },
  warningText: { ...type.meta, color: color.warnText },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  dangerButton: { backgroundColor: color.danger },
});

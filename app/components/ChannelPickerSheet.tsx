import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { ChannelAvatar } from './ChannelAvatar';
import { PrimaryButton } from './Buttons';
import { useChannels } from '../lib/channel-context';
import { color, font, radius, space, type } from '../lib/theme';

// 'select' — tapping a row only selects; the primary "Use {name}" button
// confirms. Dismissing without confirming changes nothing (New brief).
// 'filter' — adds an "All channels" row and applies immediately (Dashboard).
export function ChannelPickerSheet({
  visible,
  onClose,
  mode,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  mode: 'select' | 'filter';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible ? <Body mode={mode} selectedId={selectedId} onSelect={onSelect} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function Body({
  mode,
  selectedId,
  onSelect,
  onClose,
}: {
  mode: 'select' | 'filter';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const { channels } = useChannels();
  const [pending, setPending] = useState<string | null>(selectedId);
  const pendingChannel = channels.find((c) => c.id === pending);

  const choose = (id: string | null) => {
    if (mode === 'filter') {
      onSelect(id);
      onClose();
    } else {
      setPending(id);
    }
  };

  const active = mode === 'filter' ? selectedId : pending;

  return (
    <>
      <Text style={styles.title}>{mode === 'filter' ? 'Show data for…' : 'Run this brief on…'}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {mode === 'filter' ? (
          <Row
            selected={active === null}
            onPress={() => choose(null)}
            avatar={
              <View style={styles.allTile}>
                <Feather name="grid" size={18} color={color.ink} />
              </View>
            }
            name="All channels"
          />
        ) : null}
        {channels.map((c, i) => (
          <Row
            key={c.id}
            selected={active === c.id}
            onPress={() => choose(c.id)}
            avatar={<ChannelAvatar index={i} size={40} />}
            name={c.name}
            status={
              mode === 'select'
                ? c.hasYoutubeCredential
                  ? { text: 'YouTube connected', ok: true }
                  : { text: 'Not connected — connect to run', ok: false }
                : undefined
            }
          />
        ))}
      </ScrollView>
      {mode === 'select' ? (
        <PrimaryButton
          label={pendingChannel ? `Use ${pendingChannel.name}` : 'Use channel'}
          disabled={!pendingChannel}
          onPress={() => {
            if (pending) onSelect(pending);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

function Row({
  selected,
  onPress,
  avatar,
  name,
  status,
}: {
  selected: boolean;
  onPress: () => void;
  avatar: React.ReactNode;
  name: string;
  status?: { text: string; ok: boolean };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {avatar}
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {status ? (
          <Text style={[styles.status, { color: status.ok ? color.okText : color.warnText }]} numberOfLines={1}>
            {status.text}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Feather name="check" size={14} color={color.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { ...type.stackTitle, color: color.ink },
  list: { maxHeight: 460 },
  listContent: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
  },
  rowSelected: { backgroundColor: color.accentSoft },
  rowText: { flex: 1 },
  name: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  status: { fontFamily: font.regular, fontSize: 12 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: color.accent, borderColor: color.accent },
  allTile: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

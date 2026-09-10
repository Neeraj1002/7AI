import React, { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { useChannels } from '../lib/channel-context';

// MOBILE_APP_DESIGN.md Section 4: present and wired to GET /channels from
// day one, even with a single channel active, so adding channel #2 later is
// a data change, not a UI rewrite. Deliberately plain (a pill + a modal
// list) — Task 2's own scoping note says favor plain controls over custom
// visual design in this pass.
export function ChannelSwitcher() {
  const { channels, selectedChannelId, setSelectedChannelId, isLoading } = useChannels();
  const [open, setOpen] = useState(false);

  const selected = channels.find((c) => c.id === selectedChannelId);

  if (isLoading) return null;
  if (channels.length === 0) {
    return <Text style={styles.empty}>No channels</Text>;
  }

  return (
    <View>
      <Pressable style={styles.pill} onPress={() => setOpen(true)}>
        <Text style={styles.pillText} numberOfLines={1}>
          {selected?.name ?? 'Select channel'}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <FlatList
              data={channels}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    setSelectedChannelId(item.id);
                    setOpen(false);
                  }}
                >
                  <Text style={item.id === selectedChannelId ? styles.rowTextSelected : styles.rowText}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#eee',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 160,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 12, color: '#999', paddingHorizontal: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', paddingTop: 100 },
  sheet: { backgroundColor: '#fff', marginHorizontal: 24, borderRadius: 12, maxHeight: 300, paddingVertical: 8 },
  row: { paddingHorizontal: 16, paddingVertical: 12 },
  rowText: { fontSize: 15 },
  rowTextSelected: { fontSize: 15, fontWeight: '700' },
});

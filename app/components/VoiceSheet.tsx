import React from 'react';
import { BottomSheet } from './BottomSheet';
import { VoicePicker } from './VoicePicker';

// The voice list in its own bottom sheet, for run setup and channel settings (nothing else is open under it there). The
// Edit settings sheet does not use this: it shows `VoicePicker` as a page inside itself, so no second modal stacks.
export function VoiceSheet({
  visible,
  onClose,
  title,
  defaultLabel,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Label of the "no choice, use the default" row, or undefined when there is no such row. */
  defaultLabel?: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* remounted per open so the selection starts from the current value and any sample stops on close */}
      {visible ? (
        <VoicePicker
          title={title}
          defaultLabel={defaultLabel}
          selected={selected}
          onUse={(id) => {
            onSelect(id);
            onClose();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

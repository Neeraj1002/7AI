import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, space, type } from '../lib/theme';
import { ScriptPreview } from './ScriptPreview';
import { StatusChip } from './StatusChip';
import { lengthWords, type ScriptVersions } from '../lib/script-versions';

// The Script tab body (Sprint 5 Task 7 R3). After Gate 1 it shows the approved text, with its own word count and length,
// and says it is the one the video used; the writer's draft sits under a labelled "Original draft" row when it differs.
export function ScriptVersionsCard({
  versions,
  isLong,
  reviewScore,
  showReviewScore,
}: {
  versions: ScriptVersions;
  isLong: boolean;
  reviewScore?: number;
  showReviewScore: boolean;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const { approved, draft, usedByVideo } = versions;
  const shown = approved ?? draft;
  if (!shown) return <Text style={styles.meta}>The script isn&apos;t written yet.</Text>;
  const chapterCount = shown.chapters?.length ?? 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.label}>{approved ? (approved.edited ? 'Approved script · edited by you' : 'Approved script') : 'Script draft'}</Text>
          <Text style={styles.meta}>
            {lengthWords(shown, isLong)}
            {chapterCount > 0 ? ` · ${chapterCount} chapters` : ''}
          </Text>
        </View>
        {showReviewScore && reviewScore !== undefined ? <StatusChip kind="neutral" label={`Review ${reviewScore}/10`} /> : null}
      </View>
      {approved ? (
        usedByVideo === 'draft' ? (
          <Text style={styles.usedWarn}>The video was made from the original draft, not from this approved script.</Text>
        ) : usedByVideo === 'approved' ? (
          <Text style={styles.used}>✓ This is the script the video was made from.</Text>
        ) : (
          <Text style={styles.meta}>The video will be made from this script.</Text>
        )
      ) : null}
      <ScriptPreview chapters={shown.chapters} scriptText={shown.text} lines={5} />
      {(approved?.edited || usedByVideo === 'draft') && draft && approved ? (
        <View style={styles.draft}>
          <Pressable onPress={() => setDraftOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: draftOpen }} style={styles.draftHeader}>
            <Text style={styles.draftTitle}>{usedByVideo === 'draft' ? 'Original draft · used by the video' : 'Original draft · not used'}</Text>
            <Text style={styles.meta}>
              {lengthWords(draft, isLong)} {draftOpen ? '▲' : '▼'}
            </Text>
          </Pressable>
          {draftOpen ? <ScriptPreview chapters={draft.chapters} scriptText={draft.text} lines={5} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  headerText: { flex: 1, gap: 2 },
  label: { fontFamily: font.black, fontSize: 15, color: color.ink },
  meta: { ...type.meta },
  usedWarn: { fontFamily: font.bold, fontSize: 12, color: color.warnText },
  used: { fontFamily: font.bold, fontSize: 12, color: color.okText },
  draft: { borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.xs },
  draftHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  draftTitle: { fontFamily: font.bold, fontSize: 13, color: color.muted },
});

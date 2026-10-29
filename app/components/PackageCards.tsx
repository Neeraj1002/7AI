import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from './Card';
import { StatusChip } from './StatusChip';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { useAuthedImageSource } from '../lib/use-authed-image';
import {
  NO_CHOICE_NOTE,
  YOUTUBE_SUGGESTED,
  answeredLine,
  askedLine,
  choiceSummary,
  coldReaderLine,
  deviceLabel,
  downloadLink,
  durationChip,
  headToHeadLine,
  pictureLink,
  publishedThumbnailStatus,
  secondRoundNote,
  strangerLines,
  titleCounter,
  type PackageView,
  type PackagingResponse,
  type PackagingView,
  type PublishedThumbnail,
} from '../lib/packaging';
import { color, font, radius, space, type } from '../lib/theme';

// Sprint 6 Task 1 (R5, R6): the Gate 2 thumbnail and title options as YouTube-feed-style cards, and the result card
// after publishing. Built on the existing Gate 2 layout; the founder's designer screens were not available when
// this was written, so spacing and wording here are a first pass, not the final design.

function Picture({ url, apiUrl, token, style }: { url: string; apiUrl: string | null; token: string; style: object }) {
  const link = pictureLink(url, apiUrl);
  const source = useAuthedImageSource(link?.url ?? null, token, link?.sendAuth ?? true);
  return source ? <Image source={source} style={style} resizeMode="cover" accessibilityIgnoresInvertColors /> : <View style={[style, styles.pictureBlank]} />;
}

export type ChoosePayload = { packageId: string; editedTitle?: string };

function OptionCard({
  pkg,
  view,
  channelName,
  apiUrl,
  token,
  selected,
  editable,
  busy,
  onChoose,
}: {
  pkg: PackageView;
  view: PackagingView;
  channelName: string;
  apiUrl: string | null;
  token: string;
  selected: boolean;
  editable: boolean;
  busy: boolean;
  onChoose: (p: ChoosePayload) => void;
}) {
  const chosenTitle = selected && view.choice?.title ? view.choice.title : pkg.title;
  const [title, setTitle] = useState(chosenTitle);
  const [sizesOpen, setSizesOpen] = useState(false);
  const [strangerOpen, setStrangerOpen] = useState(false);
  const chip = durationChip(view.videoSeconds);
  const counter = titleCounter(title, view.titleLimit);
  const note = coldReaderLine(pkg);
  const stranger = strangerLines(pkg);
  const h2h = headToHeadLine(pkg);
  const download = downloadLink((pkg.imageUrls?.full ?? pkg.firstFrameUrl ?? ""), apiUrl);
  return (
    <View style={[styles.option, selected && styles.optionSelected]}>
      <View style={styles.thumbWrap}>
        <Picture url={(pkg.imageUrls?.feed ?? pkg.firstFrameUrl ?? "")} apiUrl={apiUrl} token={token} style={styles.thumb} />
        {chip ? (
          <View style={styles.durationChip}>
            <Text style={styles.durationText}>{chip}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.feedTitle} numberOfLines={2}>
        {title.trim() || pkg.title}
      </Text>
      <Text style={styles.meta}>{channelName} · Just now</Text>
      <View style={styles.chips}>
        <StatusChip kind="neutral" label={deviceLabel(pkg.device)} />
        {pkg.round === 2 ? <StatusChip kind="attention" label="Second round" /> : null}
        {selected ? <StatusChip kind="ok" label="Chosen" icon="check" /> : null}
      </View>
      <Text style={styles.ask}>{askedLine(pkg.question)}</Text>
      <Text style={styles.answered}>{answeredLine(pkg.answeredAt)}</Text>
      {pkg.warnings.map((w) => (
        <Text key={w} style={styles.warn}>
          ! {w}
        </Text>
      ))}
      {note && !stranger.length ? <Text style={styles.meta}>{note}</Text> : null}
      {h2h ? <Text style={styles.meta}>{h2h}</Text> : null}
      {stranger.length > 0 ? (
        <>
          <Pressable onPress={() => setStrangerOpen((o) => !o)} accessibilityRole="button" style={styles.link}>
            <Text style={styles.linkText}>{strangerOpen ? 'Hide what a stranger said' : 'What a stranger said (advisory)'}</Text>
          </Pressable>
          {strangerOpen ? stranger.map((l) => <Text key={l} style={styles.meta}>{l}</Text>) : null}
        </>
      ) : null}

      {editable ? (
        <>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            multiline
            accessibilityLabel="Title"
            editable={!busy}
          />
          <Text style={[styles.meta, counter.over && styles.over]}>{counter.text} characters. An edited title is checked against the script before it is accepted.</Text>
          <PrimaryButton
            label={selected ? 'Save this choice' : 'Use this one'}
            onPress={() => onChoose({ packageId: pkg.id, ...(title.trim() && title.trim() !== pkg.title ? { editedTitle: title.trim() } : {}) })}
            loading={busy}
            disabled={counter.over || !title.trim()}
          />
        </>
      ) : null}

      <Pressable onPress={() => setSizesOpen((o) => !o)} accessibilityRole="button" style={styles.link}>
        <Text style={styles.linkText}>{sizesOpen ? 'Hide small sizes' : 'See small sizes and download'}</Text>
      </Pressable>
      {sizesOpen ? (
        <View style={styles.sizes}>
          <Text style={styles.meta}>
            Feed size · lettering is {pkg.lettering.words}
            {pkg.lettering.subline ? ` / ${pkg.lettering.subline}` : ''} in {pkg.lettering.typeface}
          </Text>
          <Picture url={(pkg.imageUrls?.feed ?? pkg.firstFrameUrl ?? "")} apiUrl={apiUrl} token={token} style={styles.feedSize} />
          <Text style={styles.meta}>Sidebar size</Text>
          <Picture url={(pkg.imageUrls?.sidebar ?? pkg.firstFrameUrl ?? "")} apiUrl={apiUrl} token={token} style={styles.sidebarSize} />
          {download ? (
            <Pressable onPress={() => void Linking.openURL(download)} accessibilityRole="link" style={styles.link}>
              <Text style={styles.linkText}>↓ Download the full-size file</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function PackageCards({
  response,
  channelName,
  apiUrl,
  token,
  editable,
  choosing,
  chooseError,
  onChoose,
}: {
  response: PackagingResponse | undefined;
  channelName: string;
  apiUrl: string | null;
  token: string;
  editable: boolean;
  choosing: boolean;
  chooseError: string | null;
  onChoose: (p: ChoosePayload) => void;
}) {
  if (!response) return null;
  if (response.pending) {
    return (
      <Card>
        <Text style={styles.cardTitle}>Thumbnail and title</Text>
        <View style={styles.pending}>
          <ActivityIndicator color={color.ink} />
          <Text style={styles.meta}>Making thumbnail and title options. This takes about a minute; Approve works once it is done.</Text>
        </View>
      </Card>
    );
  }
  const view = response.view;
  if (!view) return null;
  if (view.status !== 'ready') {
    return (
      <Card>
        <Text style={styles.cardTitle}>Thumbnail and title</Text>
        <Text style={styles.body}>No custom thumbnail options for this video: {view.reason ?? view.status}</Text>
        {secondRoundNote(view) ? <Text style={styles.body}>{secondRoundNote(view)}</Text> : null}
        <Text style={styles.meta}>YouTube&apos;s suggested thumbnail stays, and the title is written when you approve.</Text>
        {view.dropped.length > 0 ? <Dropped view={view} /> : null}
      </Card>
    );
  }
  const keptYoutube = view.choice?.packageId === YOUTUBE_SUGGESTED;
  const summary = choiceSummary(view);
  return (
    <Card>
      <Text style={styles.cardTitle}>Thumbnail and title</Text>
      <Text style={styles.meta}>Each option is a thumbnail and a title made as one pair. The line under each says what a viewer will ask and where the video answers it.</Text>
      {view.brief ? <Text style={styles.body}>The gap: {view.brief.question}</Text> : null}
      {secondRoundNote(view) ? <Text style={styles.warn}>{secondRoundNote(view)}</Text> : null}
      {view.openingNote ? <Text style={styles.meta}>{view.openingNote}</Text> : null}
      {view.packages.map((p) => (
        <OptionCard
          key={p.id}
          pkg={p}
          view={view}
          channelName={channelName}
          apiUrl={apiUrl}
          token={token}
          selected={view.choice?.packageId === p.id}
          editable={editable}
          busy={choosing}
          onChoose={onChoose}
        />
      ))}
      {editable ? (
        <SecondaryButton
          label={keptYoutube ? "Keeping YouTube's suggested thumbnail" : "Keep YouTube's suggested thumbnail"}
          onPress={() => onChoose({ packageId: YOUTUBE_SUGGESTED })}
          disabled={choosing || keptYoutube}
        />
      ) : null}
      {chooseError ? <Text style={styles.error}>{chooseError}</Text> : null}
      <Text style={styles.meta}>{summary ?? (editable ? NO_CHOICE_NOTE : '')}</Text>
      {view.dropped.length > 0 ? <Dropped view={view} /> : null}
    </Card>
  );
}

function Dropped({ view }: { view: PackagingView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={styles.link}>
        <Text style={styles.linkText}>{open ? 'Hide ideas that were dropped' : `Ideas that were dropped (${view.dropped.length})`}</Text>
      </Pressable>
      {open
        ? view.dropped.map((d, i) => (
            <Text key={`${d.title}-${i}`} style={styles.meta}>
              “{d.title}” ({deviceLabel(d.device)}): {d.reasons.join(' ')}
            </Text>
          ))
        : null}
    </>
  );
}

// R6: what is really live on YouTube, plus the chosen file when it did not go up.
export function PublishedThumbnailCard({
  output,
  response,
  apiUrl,
}: {
  output: { coverFrameSet?: boolean; coverFrameMessage?: string; thumbnail?: PublishedThumbnail } | undefined;
  response: PackagingResponse | undefined;
  apiUrl: string | null;
}) {
  const status = publishedThumbnailStatus(output);
  if (!status) return null;
  const pkg = output?.thumbnail?.packageId ? response?.view?.packages.find((p) => p.id === output.thumbnail!.packageId) : undefined;
  const download = pkg ? downloadLink((pkg.imageUrls?.full ?? pkg.firstFrameUrl ?? ""), apiUrl) : null;
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.cardTitle}>Thumbnail</Text>
        <StatusChip kind={status.kind} label={status.kind === 'ok' ? '✓ Live' : status.kind === 'attention' ? '! Not set' : 'YouTube’s'} />
      </View>
      <Text style={styles.body}>{status.headline}</Text>
      {status.detail ? <Text style={styles.meta}>{status.detail}</Text> : null}
      {status.canDownload && download ? (
        <Pressable onPress={() => void Linking.openURL(download)} accessibilityRole="link" style={styles.link}>
          <Text style={styles.linkText}>↓ Download the thumbnail file</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: font.black, fontSize: 16, color: color.ink },
  body: { ...type.body, color: color.ink },
  meta: { ...type.meta },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  pending: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  option: { gap: space.xs, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.border },
  optionSelected: { backgroundColor: color.accentSoft, borderRadius: radius.md, paddingHorizontal: space.sm },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.video },
  thumb: { width: '100%', height: '100%' },
  pictureBlank: { backgroundColor: color.surface2 },
  durationChip: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  durationText: { fontFamily: font.bold, fontSize: 12, color: color.onAccent },
  feedTitle: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, color: color.ink, marginTop: space.xs },
  chips: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', marginVertical: space.xs },
  ask: { ...type.bodyStrong, color: color.ink },
  answered: { ...type.body, color: color.muted },
  titleInput: { borderWidth: 1.5, borderColor: color.inputBorder, borderRadius: radius.sm, padding: space.sm, fontFamily: font.regular, fontSize: 15, color: color.ink, minHeight: 44, marginTop: space.sm },
  over: { color: color.danger },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: font.black, fontSize: 14, color: color.accentText },
  sizes: { gap: space.xs },
  feedSize: { width: 360, maxWidth: '100%', aspectRatio: 16 / 9, borderRadius: radius.sm },
  sidebarSize: { width: 170, aspectRatio: 16 / 9, borderRadius: radius.sm },
  error: { ...type.body, color: color.danger },
  warn: { ...type.body, color: color.warnText },
});

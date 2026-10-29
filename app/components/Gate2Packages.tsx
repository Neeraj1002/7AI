import React, { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthedImageSource } from '../lib/use-authed-image';
import { downloadLink, pictureLink } from '../lib/packaging';
import {
  YOUTUBE_SUGGESTED,
  answeredChip,
  cardTitle,
  downloadLabel,
  durationChip,
  gate2Screen,
  isChosen,
  isSecondRound,
  isShortPackaging,
  isTitleEdited,
  keptLabel,
  keptYoutube,
  makingCopy,
  noPackageCopy,
  packageLabel,
  quietLinkLabel,
  whyThisWorks,
  type Gate2Package,
  type Gate2Response,
  type Gate2View,
} from '../lib/gate2-packaging';
import { color, font, radius, space, type } from '../lib/theme';

// Sprint 6 Task 1 (Gate 2 package screens, FE): the designer's NEXT 4 boards, as a section under the Video review card.
// Swipe cards for a Video, one card for a Short, the quiet YouTube link and chosen row, the no-package card and the making
// skeletons. The server decides everything (limits, checks, what is live); this only formats what it sends.

function Picture({ url, apiUrl, token, style }: { url: string | null; apiUrl: string | null; token: string; style: object }) {
  const link = url ? pictureLink(url, apiUrl) : null;
  const source = useAuthedImageSource(link?.url ?? null, token, link?.sendAuth ?? true);
  return source ? <Image source={source} style={style} resizeMode="cover" accessibilityIgnoresInvertColors /> : <View style={[style, styles.blank]} />;
}

const Pill = ({ label, tone }: { label: string; tone: 'warn' | 'neutral' }) => (
  <View style={[styles.pill, tone === 'warn' ? styles.pillWarn : styles.pillNeutral]}>
    <Text style={[styles.pillText, tone === 'warn' && { color: color.warnText }]}>{label}</Text>
  </View>
);

function PackageCard({
  pkg,
  view,
  short,
  width,
  channelName,
  apiUrl,
  token,
  editable,
  busy,
  dimmed,
  onChoose,
  onEdit,
}: {
  pkg: Gate2Package;
  view: Gate2View;
  short: boolean;
  width: number;
  channelName: string;
  apiUrl: string | null;
  token: string;
  editable: boolean;
  busy: boolean;
  dimmed: boolean;
  onChoose: () => void;
  onEdit: () => void;
}) {
  const chosen = isChosen(view, pkg);
  const chip = durationChip(view.videoSeconds);
  const why = whyThisWorks(pkg);
  const fileUrl = short ? pkg.firstFrameUrl : pkg.imageUrls?.full;
  const download = fileUrl ? downloadLink(fileUrl, apiUrl) : null;
  return (
    <View style={[styles.card, { width }, chosen && styles.cardChosen, dimmed && styles.dim]}>
      {short ? (
        <View style={styles.shortTop}>
          <View style={styles.frameWrap}>
            <Picture url={pkg.firstFrameUrl ?? null} apiUrl={apiUrl} token={token} style={styles.frame} />
            <View style={styles.frameTag}>
              <Text style={styles.chipText}>First frame</Text>
            </View>
          </View>
          <View style={styles.shortText}>
            {cardTitle(view, pkg) ? (
              <>
                <Text style={styles.label}>Title</Text>
                <Text style={styles.cardHead}>{cardTitle(view, pkg)}</Text>
              </>
            ) : null}
            {pkg.hookLine ? (
              <>
                <Text style={[styles.label, { marginTop: space.xs }]}>Hook line</Text>
                <Text style={styles.hook}>{pkg.hookLine}</Text>
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.thumbWrap}>
            <Picture url={pkg.imageUrls?.feed ?? null} apiUrl={apiUrl} token={token} style={styles.thumb} />
            {chip ? (
              <View style={styles.durationChip}>
                <Text style={styles.durationText}>{chip}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.feedRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{channelName.trim().charAt(0).toUpperCase() || 'C'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHead}>{cardTitle(view, pkg)}</Text>
              <Text style={styles.meta}>{channelName}</Text>
            </View>
          </View>
        </>
      )}
      <View style={styles.body}>
        {isSecondRound(pkg) ? <Pill label="Second round" tone="warn" /> : null}
        {isTitleEdited(view, pkg) ? <Pill label="Title edited" tone="neutral" /> : null}
        <View style={{ gap: 2 }}>
          <Text style={styles.label}>Viewers will ask</Text>
          <Text style={styles.ask}>{pkg.question}</Text>
        </View>
        <View style={styles.answeredRow}>
          <Text style={styles.label}>Answered at</Text>
          <View style={styles.answeredChip}>
            <Text style={styles.answeredText}>{answeredChip(pkg)}</Text>
          </View>
        </View>
        {why ? <Text style={styles.why}>Why this works: {why}</Text> : null}
        {pkg.warnings.map((w) => (
          <Text key={w} style={styles.warn}>
            ! {w}
          </Text>
        ))}
      </View>
      {short && download ? (
        <View style={styles.actions}>
          <Pressable style={styles.secondaryBtn} onPress={() => void Linking.openURL(download)} accessibilityRole="link">
            <Feather name="download" size={16} color={color.ink} />
            <Text style={styles.secondaryText}>{downloadLabel(true)}</Text>
          </Pressable>
        </View>
      ) : null}
      {editable && !short ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onChoose}
            disabled={busy || chosen}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen, disabled: busy }}
            style={[styles.choose, chosen && styles.chooseOn]}
          >
            {chosen ? <Feather name="check" size={20} color={color.onAccent} /> : null}
            <Text style={styles.chooseText}>{chosen ? 'Chosen' : 'Choose this one'}</Text>
          </Pressable>
          <View style={styles.secondary}>
            <Pressable
              style={styles.secondaryBtn}
              disabled={!download}
              onPress={() => download && void Linking.openURL(download)}
              accessibilityRole="link"
            >
              <Feather name="download" size={16} color={color.ink} />
              <Text style={styles.secondaryText}>{downloadLabel(false)}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={onEdit} accessibilityRole="button">
              <Feather name="edit-2" size={16} color={color.ink} />
              <Text style={styles.secondaryText}>Edit title</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function Gate2Packages({
  response,
  channelName,
  apiUrl,
  token,
  editable,
  choosing,
  chooseError,
  onChoose,
  onEdit,
}: {
  response: Gate2Response | undefined;
  channelName: string;
  apiUrl: string | null;
  token: string;
  editable: boolean;
  choosing: boolean;
  chooseError: string | null;
  onChoose: (packageId: string) => void;
  onEdit: (pkg: Gate2Package) => void;
}) {
  const screen = gate2Screen(response);
  const { width: windowWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  // The server has no way to un-choose, so "Change" only brings the cards back to full strength; the choice stands until another is made.
  const [reopened, setReopened] = useState(false);
  if (screen === 'none') return null;
  if (screen === 'making' || screen === 'pending') {
    return <Making round={response?.view?.round} />;
  }
  const view = response!.view!;
  if (screen === 'no_package') return <NoPackage view={view} />;

  const short = screen === 'short';
  const total = view.packages.length;
  const cardWidth = short ? windowWidth - 2 * space.lg : Math.min(316, windowWidth - 2 * space.lg - 24);
  const step = cardWidth + space.md;
  const yt = keptYoutube(view) && !reopened;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    setIndex(Math.max(0, Math.min(total - 1, i)));
  };
  const cards = view.packages.map((p) => (
    <PackageCard
      key={p.id}
      pkg={p}
      view={view}
      short={short}
      width={cardWidth}
      channelName={channelName}
      apiUrl={apiUrl}
      token={token}
      editable={editable}
      busy={choosing}
      dimmed={yt}
      onChoose={() => {
        setReopened(false);
        onChoose(p.id);
      }}
      onEdit={() => onEdit(p)}
    />
  ));
  return (
    <View style={styles.section}>
      <View style={{ gap: 2 }}>
        <Text style={styles.sectionTitle}>How should it look on YouTube?</Text>
        <Text style={styles.meta}>
          {short
            ? 'This is how your Short opens. To change it, use Revise.'
            : 'Swipe to compare. You get one per video, and what you choose is exactly what gets published.'}
        </Text>
        {short && view.openingNote ? <Text style={styles.meta}>{view.openingNote}</Text> : null}
        {view.round === 2 ? <Text style={styles.meta}>This is the second set. The first one didn’t pass our checks.</Text> : null}
      </View>
      {short ? (
        <View>{cards}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{ gap: space.md, paddingRight: space.lg }}
        >
          {cards}
        </ScrollView>
      )}
      {!short && total > 1 ? (
        <View style={styles.dots} accessibilityLabel={packageLabel(index, total)}>
          {view.packages.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
          <Text style={styles.dotLabel}>{packageLabel(index, total)}</Text>
        </View>
      ) : null}
      {editable && !short ? (
        yt ? (
          <View style={styles.ytRow}>
            <Feather name="check" size={20} color={color.okText} />
            <Text style={styles.ytText}>{keptLabel}</Text>
            <Pressable onPress={() => setReopened(true)} accessibilityRole="button" style={styles.changeBtn}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setReopened(false);
              onChoose(YOUTUBE_SUGGESTED);
            }}
            disabled={choosing} accessibilityRole="button" style={styles.quiet}>
            <Text style={styles.quietText}>{quietLinkLabel}</Text>
            <Feather name="chevron-right" size={16} color={color.muted} />
          </Pressable>
        )
      ) : null}
      {chooseError ? <Text style={styles.error}>{chooseError}</Text> : null}
    </View>
  );
}

function NoPackage({ view }: { view: Gate2View }) {
  const copy = noPackageCopy(view);
  const short = isShortPackaging(view);
  return (
    <View style={styles.section}>
      <View style={styles.greyCard}>
        <View style={styles.greyHead}>
          <View style={styles.greyIcon}>
            <Feather name="info" size={22} color={color.muted} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.greyTitle}>{copy.head}</Text>
            <Text style={styles.greyLead}>{copy.lead}</Text>
          </View>
        </View>
        {copy.reasons.length > 0 ? (
          <View style={styles.reasons}>
            <Text style={styles.label}>Why</Text>
            {copy.reasons.map((r) => (
              <View key={r} style={styles.reasonRow}>
                <View style={styles.bullet} />
                <Text style={styles.reasonText}>{r}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text style={styles.sectionTitle}>Used for this video</Text>
      <View style={styles.usedCard}>
        <View style={styles.usedThumb}>
          <Feather name="image" size={26} color={color.muted} />
          {!short && durationChip(view.videoSeconds) ? (
            <View style={styles.durationChip}>
              <Text style={styles.durationText}>{durationChip(view.videoSeconds)}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.usedTitle}>{short ? 'The script’s own title and hook' : 'YouTube’s suggested thumbnail'}</Text>
          <Text style={styles.meta}>{short ? 'The title comes from the script.' : 'YouTube picks it from your video. The title comes from the script.'}</Text>
          <View style={styles.chosenRow}>
            <Feather name="check" size={14} color={color.okText} />
            <Text style={styles.chosenText}>Chosen</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Making({ round }: { round: 1 | 2 | undefined }) {
  const copy = makingCopy(round);
  return (
    <View style={styles.section}>
      <View style={[styles.pill, styles.pillNeutral, { alignSelf: 'flex-start' }]}>
        <Text style={styles.pillText}>Making packages</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.sectionTitle}>{copy.title}</Text>
        <Text style={styles.meta}>{copy.sub}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }} scrollEnabled={false}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.card, { width: 300 }]} accessibilityLabel="Making a package">
            <View style={[styles.sk, styles.skImage]}>
              <Text style={styles.skText}>Drawing thumbnail…</Text>
            </View>
            <View style={styles.body}>
              <View style={[styles.sk, { height: 16, width: '92%' }]} />
              <View style={[styles.sk, { height: 16, width: '58%' }]} />
              <View style={[styles.sk, { height: 12, width: '80%', marginTop: space.sm }]} />
              <View style={[styles.sk, { height: 12, width: '50%' }]} />
            </View>
            <View style={styles.actions}>
              <View style={[styles.sk, { height: 52, borderRadius: radius.lg }]} />
            </View>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.statusNote}>Gate 2 opens when the packages are ready. The approve buttons appear then.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  sectionTitle: { fontFamily: font.black, fontSize: 18, lineHeight: 22, color: color.ink },
  meta: { ...type.meta, lineHeight: 18 },
  label: { fontFamily: font.bold, fontSize: 12, color: color.muted },
  blank: { backgroundColor: color.surface2 },
  card: { borderRadius: radius.xl, borderWidth: 1.5, borderColor: color.ink, backgroundColor: color.surface, overflow: 'hidden' },
  cardChosen: { borderColor: color.okText, borderWidth: 2 },
  dim: { opacity: 0.5 },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: color.video },
  thumb: { width: '100%', height: '100%' },
  durationChip: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  durationText: { fontFamily: font.bold, fontSize: 11, color: color.onAccent },
  feedRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.black, color: color.accentText },
  cardHead: { fontFamily: font.black, fontSize: 15, lineHeight: 20, color: color.ink },
  shortTop: { flexDirection: 'row', gap: space.md, paddingHorizontal: 14, paddingTop: 12 },
  frameWrap: { width: 100, height: 178, borderRadius: 10, overflow: 'hidden', backgroundColor: color.video },
  frame: { width: '100%', height: '100%' },
  frameTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { fontFamily: font.bold, fontSize: 10, color: color.onAccent },
  shortText: { flex: 1, gap: 4, minWidth: 0 },
  hook: { fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.ink },
  body: { gap: space.sm, padding: 14 },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillWarn: { backgroundColor: color.warnBg },
  pillNeutral: { backgroundColor: color.surface2 },
  pillText: { fontFamily: font.black, fontSize: 11, color: color.ink },
  ask: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.ink },
  answeredRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  answeredChip: { backgroundColor: color.surface2, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  answeredText: { fontFamily: font.black, fontSize: 12, color: color.ink },
  why: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: color.muted },
  warn: { ...type.body, color: color.warnText },
  actions: { paddingHorizontal: 14, paddingBottom: 6 },
  choose: { height: 52, borderRadius: radius.lg, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  chooseOn: { backgroundColor: color.okText },
  chooseText: { fontFamily: font.black, fontSize: 16, color: color.onAccent },
  secondary: { flexDirection: 'row' },
  secondaryBtn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryText: { fontFamily: font.black, fontSize: 14, color: color.ink },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.future },
  dotOn: { width: 20, backgroundColor: color.ink },
  dotLabel: { fontFamily: font.bold, fontSize: 12, color: color.muted, marginLeft: space.xs },
  quiet: { alignSelf: 'center', minHeight: 44, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  quietText: { fontFamily: font.bold, fontSize: 14, color: color.muted },
  ytRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: color.surface2 },
  ytText: { flex: 1, fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.ink },
  changeBtn: { minHeight: 44, justifyContent: 'center' },
  changeText: { fontFamily: font.black, fontSize: 13, color: color.accent },
  error: { ...type.body, color: color.danger },
  greyCard: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.surface2 },
  greyHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  greyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  greyTitle: { fontFamily: font.black, fontSize: 17, lineHeight: 22, color: color.ink },
  greyLead: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  reasons: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.border },
  reasonRow: { flexDirection: 'row', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.muted, marginTop: 7 },
  reasonText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.ink },
  usedCard: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: 14, borderRadius: radius.xl, borderWidth: 2, borderColor: color.okText },
  usedThumb: { width: 112, height: 63, borderRadius: 8, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  usedTitle: { fontFamily: font.black, fontSize: 14, lineHeight: 19, color: color.ink },
  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chosenText: { fontFamily: font.black, fontSize: 12, color: color.okText },
  sk: { backgroundColor: color.surface2, borderRadius: 6 },
  skImage: { height: 168, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  skText: { fontFamily: font.bold, fontSize: 13, color: color.muted },
  statusNote: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, color: color.muted },
});

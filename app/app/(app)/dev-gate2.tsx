import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Screen } from '../../components/Screen';
import { Gate2Packages } from '../../components/Gate2Packages';
import { EditTitleScreen } from '../../components/EditTitleScreen';
import { Gate2Thumbnail } from '../../components/Gate2Thumbnail';
import { GATE2_FIXTURES, THUMBNAIL_FIXTURES, TITLE_CHECK_FIXTURES } from '../../lib/gate2-fixtures';
import { statusLine, canChoose, type Gate2Package, type Gate2Response, type TitleCheck } from '../../lib/gate2-packaging';
import { color, font, radius, space } from '../../lib/theme';

// Sprint 6 Task 1 (Gate 2 package screens, FE): a development-only way to see every state on the phone without a run.
// Reached by the route /dev-gate2; in a release build it redirects away. Choosing and editing change local state only.

export default function DevGate2() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Fixtures />;
}

function Fixtures() {
  const [key, setKey] = useState('ready-3');
  const [local, setLocal] = useState<Gate2Response>(GATE2_FIXTURES['ready-3']);
  const [thumb, setThumb] = useState<string | null>(null);
  const [editing, setEditing] = useState<Gate2Package | null>(null);
  const [titleKey, setTitleKey] = useState('clean');

  const pick = (k: string) => {
    setKey(k);
    setThumb(null);
    setLocal(GATE2_FIXTURES[k]);
  };
  const choose = (packageId: string) => {
    const view = local.view;
    if (!view) return;
    const p = view.packages.find((x) => x.id === packageId);
    setLocal({ ...local, view: { ...view, choice: { packageId, title: p?.title ?? null, titleEdited: false } } });
  };
  // A fixture "server": the same text the real check would return for the chosen sample, whatever is typed.
  const checkTitle = useCallback(
    (title: string): Promise<TitleCheck> => {
      const sample = TITLE_CHECK_FIXTURES[titleKey];
      const exact = Object.values(TITLE_CHECK_FIXTURES).find((c) => c.title === title);
      return Promise.resolve((exact ?? sample).check);
    },
    [titleKey],
  );
  const status = local.view && canChoose(local) ? statusLine(local.view) : null;
  const t = useMemo(() => (thumb ? THUMBNAIL_FIXTURES[thumb] : null), [thumb]);

  return (
    <Screen title="Gate 2 fixtures" subtitle="Development only" variant="stack">
      <ScrollView contentContainerStyle={styles.content}>
        <Chips label="Packages" keys={Object.keys(GATE2_FIXTURES)} active={thumb ? '' : key} onPick={pick} />
        <Chips label="After publishing" keys={Object.keys(THUMBNAIL_FIXTURES)} active={thumb ?? ''} onPick={setThumb} />
        <Chips label="Edit title check (sample)" keys={Object.keys(TITLE_CHECK_FIXTURES)} active={titleKey} onPick={setTitleKey} />
        {t ? (
          <Gate2Thumbnail thumbnail={t} apiUrl={null} token="" pictureUrl={null} />
        ) : (
          <Gate2Packages
            response={local}
            channelName="[Channel name]"
            apiUrl={null}
            token=""
            editable
            choosing={false}
            chooseError={null}
            onChoose={choose}
            onEdit={setEditing}
          />
        )}
        {status ? <Text style={styles.status}>{status.text}</Text> : null}
      </ScrollView>
      <EditTitleScreen
        visible={editing !== null}
        pkg={editing}
        index={Math.max(0, local.view?.packages.findIndex((p) => p.id === editing?.id) ?? 0)}
        initialTitle={TITLE_CHECK_FIXTURES[titleKey].title || editing?.title || ''}
        titleLimit={local.view?.titleLimit ?? 70}
        checkTitle={checkTitle}
        saving={false}
        saveError={null}
        apiUrl={null}
        token=""
        onClose={() => setEditing(null)}
        onSave={(title) => {
          const view = local.view;
          if (view && editing) setLocal({ ...local, view: { ...view, choice: { packageId: editing.id, title, titleEdited: true } } });
          setEditing(null);
        }}
      />
    </Screen>
  );
}

function Chips({ label, keys, active, onPick }: { label: string; keys: string[]; active: string; onPick: (k: string) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.chipsLabel}>{label}</Text>
      <View style={styles.chips}>
        {keys.map((k) => (
          <Pressable key={k} onPress={() => onPick(k)} style={[styles.chip, k === active && styles.chipOn]}>
            <Text style={[styles.chipText, k === active && { color: color.onAccent }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  chipsLabel: { fontFamily: font.bold, fontSize: 12, color: color.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.ink, justifyContent: 'center' },
  chipOn: { backgroundColor: color.ink },
  chipText: { fontFamily: font.black, fontSize: 12, color: color.ink },
  status: { fontFamily: font.bold, fontSize: 13, color: color.ink },
});

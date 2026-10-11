import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
import type { AdminOutputs } from '../../lib/use-admin';
import { color, radius, space, type } from '../../lib/theme';
import { ActionButton } from './ActionButton';
import { Banner } from './Banner';

type ContentInput = Parameters<ReturnType<typeof useContentMutation>['mutate']>[0];
type ContentResult = AdminOutputs['runs']['content'];

// admin.runs.content is a tRPC MUTATION (the server writes an audit row per call), so it is
// called only from a tap, never prefetched, and the result lives in this component's state
// only: gcTime 0 drops it from the mutation cache as soon as the screen unmounts, and nothing
// is persisted anywhere (DA-6).
function useContentMutation() {
  const trpc = useTRPC();
  return useMutation({ ...trpc.admin.runs.content.mutationOptions(), gcTime: 0 });
}

function asText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

type ManifestFile = { name: string; contentType?: string; bytes?: number };

function manifestFiles(content: unknown): ManifestFile[] {
  if (content && typeof content === 'object' && Array.isArray((content as { files?: unknown }).files)) {
    return (content as { files: ManifestFile[] }).files.filter((f) => typeof f?.name === 'string');
  }
  return [];
}

export function ContentBlock({ label, input }: { label: string; input: ContentInput }) {
  const m = useContentMutation();
  const data = m.data as ContentResult | undefined;
  return (
    <View style={styles.block}>
      <ActionButton
        label={m.data ? `Refresh ${label.toLowerCase()}` : `Show content: ${label}`}
        icon="eye"
        loading={m.isPending}
        onPress={() => m.mutate(input)}
      />
      {m.isError ? <Banner kind="error">{m.error.message || 'Could not load this content.'}</Banner> : null}
      {data ? <ContentResultView result={data} runId={input.runId} /> : null}
    </View>
  );
}

function ContentResultView({ result, runId }: { result: ContentResult; runId: string }) {
  if ('available' in result && result.available === false) {
    return <Banner kind="info">Not available for this run.</Banner>;
  }
  if (result.kind === 'bundle_file') return null;
  const content = 'content' in result ? result.content : undefined;
  const truncated = 'truncated' in result && result.truncated;
  const files = result.kind === 'bundle_manifest' ? manifestFiles(content) : [];
  const attempt = 'attemptNumber' in result ? result.attemptNumber : undefined;
  return (
    <View style={styles.block}>
      {truncated ? <Banner kind="info">The server shortened this content to its size limit.</Banner> : null}
      <ScrollView style={styles.mono} nestedScrollEnabled>
        <Text style={styles.monoText} selectable>
          {asText(content)}
        </Text>
      </ScrollView>
      {files.map((f) => (
        <FileOpenButton key={f.name} runId={runId} file={f.name} attemptNumber={attempt} />
      ))}
    </View>
  );
}

// bundle_file returns a short-lived URL; it is handed to the platform's link opener and never
// downloaded or stored by the app.
function FileOpenButton({ runId, file, attemptNumber }: { runId: string; file: string; attemptNumber?: number }) {
  const m = useContentMutation();
  return (
    <View style={styles.block}>
      <ActionButton
        label={`Open file: ${file}`}
        icon="external-link"
        loading={m.isPending}
        onPress={() =>
          m.mutate(
            { runId, kind: 'bundle_file', file, ...(attemptNumber ? { attemptNumber } : {}) },
            {
              onSuccess: (r) => {
                if ('url' in r && typeof r.url === 'string') Linking.openURL(r.url);
              },
            },
          )
        }
      />
      {m.isError ? <Banner kind="error">{m.error.message || 'Could not open this file.'}</Banner> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  mono: {
    maxHeight: 320,
    backgroundColor: color.surface2,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  monoText: { ...type.meta, fontFamily: 'monospace', fontSize: 12, color: color.ink },
});

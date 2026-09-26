import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from './trpc';
import { getSecureItem, setSecureItem } from './storage';
import type { AppRouter } from '../../studio/src/api/router';

// Sprint 3 Task 2 (FE8): the real, server-inferred shape (now that
// `channels.list` returns a derived `hasYoutubeCredential`), replacing the
// hand-rolled `{id, name, platform}` stub this app started with — the whole
// point of importing `AppRouter` directly is not needing to keep a
// duplicate, driftable shape like that in sync by hand.
export type Channel = inferRouterOutputs<AppRouter>['channels']['list'][number];

const LAST_CHANNEL_ID_KEY = 'sevenai.lastChannelId';

type ChannelContextValue = {
  channels: Channel[];
  isLoading: boolean;
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string) => void;
  /** True once a persisted last-used channel was restored on this mount (not just the list's first item). */
  isLastUsed: boolean;
  channelIndex: (id: string | null | undefined) => number;
  channelById: (id: string | null | undefined) => Channel | undefined;
};

const ChannelContext = createContext<ChannelContextValue | undefined>(undefined);

// Every screen in the app is channel-scoped from day one (MOBILE_APP_DESIGN.md
// Section 4's explicit instruction). Selection is persisted to SecureStore
// (UI Enhancement 1) so New Brief can say "Last used" instead of silently
// re-picking the first channel on every app restart.
export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.channels.list.queryOptions());
  const [selectedChannelId, setSelectedChannelIdState] = useState<string | null>(null);
  const [isLastUsed, setIsLastUsed] = useState(false);
  const [restoredLastUsed, setRestoredLastUsed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getSecureItem(LAST_CHANNEL_ID_KEY).then((stored) => setRestoredLastUsed(stored));
  }, []);

  const channels = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (selectedChannelId || channels.length === 0 || restoredLastUsed === undefined) return;
    const restored = restoredLastUsed && channels.some((c) => c.id === restoredLastUsed) ? restoredLastUsed : null;
    if (restored) {
      setSelectedChannelIdState(restored);
      setIsLastUsed(true);
    } else {
      setSelectedChannelIdState(channels[0].id);
    }
  }, [channels, selectedChannelId, restoredLastUsed]);

  const setSelectedChannelId = useCallback((id: string) => {
    setSelectedChannelIdState(id);
    setIsLastUsed(false);
    void setSecureItem(LAST_CHANNEL_ID_KEY, id);
  }, []);

  const channelIndex = useCallback(
    (id: string | null | undefined) => (id ? channels.findIndex((c) => c.id === id) : -1),
    [channels],
  );
  const channelById = useCallback(
    (id: string | null | undefined) => channels.find((c) => c.id === id),
    [channels],
  );

  const value = useMemo<ChannelContextValue>(
    () => ({
      channels,
      isLoading,
      selectedChannelId,
      setSelectedChannelId,
      isLastUsed,
      channelIndex,
      channelById,
    }),
    [channels, isLoading, selectedChannelId, setSelectedChannelId, isLastUsed, channelIndex, channelById],
  );

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useChannels(): ChannelContextValue {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannels must be used within ChannelProvider');
  return ctx;
}

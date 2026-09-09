import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

type Channel = { id: string; name: string; platform: string };

type ChannelContextValue = {
  channels: Channel[];
  isLoading: boolean;
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string) => void;
};

const ChannelContext = createContext<ChannelContextValue | undefined>(undefined);

// Every screen in the app is channel-scoped from day one (MOBILE_APP_DESIGN.md
// Section 4's explicit instruction), even though only one channel exists
// right now — adding channel #2 later is meant to be a data change, not a UI
// rewrite. Selection lives in memory (not persisted): with a single channel
// today there's nothing meaningful to remember across restarts yet, and
// persisting it is a trivial follow-up once it matters.
export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.channels.list.queryOptions());
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const channels = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  const value = useMemo<ChannelContextValue>(
    () => ({ channels, isLoading, selectedChannelId, setSelectedChannelId }),
    [channels, isLoading, selectedChannelId],
  );

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useChannels(): ChannelContextValue {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannels must be used within ChannelProvider');
  return ctx;
}

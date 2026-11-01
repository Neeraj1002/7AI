// Sprint 5 Task 7 R1 — the two `runs.list` queries the Queue and the Inbox share, plus one rule: when a run leaves the
// active list (it finished while the screen was open) the ended list is refetched at once, so the run moves across
// instead of disappearing until the next pull to refresh.
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';
import { ENDED_STATUSES, QUEUE_POLL_MS, QUEUE_STATUSES_WITH_ANGLE, someRunLeft } from './run-queries';

export function useRunLists() {
  const trpc = useTRPC();
  const active = useQuery(trpc.runs.list.queryOptions({ statuses: [...QUEUE_STATUSES_WITH_ANGLE] }, { refetchInterval: QUEUE_POLL_MS }));
  const ended = useQuery(trpc.runs.list.queryOptions({ statuses: [...ENDED_STATUSES] }));
  const refetchEnded = ended.refetch;
  const lastIds = useRef<string[] | null>(null);
  useEffect(() => {
    if (!active.data) return;
    const ids = active.data.map((r) => r.id);
    if (someRunLeft(lastIds.current, ids)) void refetchEnded();
    lastIds.current = ids;
  }, [active.data, refetchEnded]);
  return { active, ended };
}

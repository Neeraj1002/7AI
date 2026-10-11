// Bugs Task 12 - fields the server added after this build's types were generated. Read defensively so
// an older server (field absent) degrades to "nothing special" instead of throwing.
export type ManualRetryInfo = {
  max: number;
  retryStage: string | null;
  retryUsed: number;
  retryCapReached: boolean;
  reviseCapReached: boolean;
  message: string;
};

export function manualRetryOf(data: unknown): ManualRetryInfo | undefined {
  return (data as { manualRetry?: ManualRetryInfo } | undefined)?.manualRetry;
}

export function videoFallbackUsed(data: unknown): boolean {
  return (data as { videoFallbackUsed?: boolean } | undefined)?.videoFallbackUsed === true;
}

// R13 - a credential exists but Google rejected it (invalid_grant): "Reconnect needed".
export function youtubeNeedsReconnect(channel: unknown): boolean {
  return (channel as { youtubeNeedsReconnect?: boolean } | undefined)?.youtubeNeedsReconnect === true;
}

// Sprint 4 Frontend Task 2 — fields the backend adds in Sprint 4 Task 12. All optional: each element built on
// them appears the moment the field is present and falls back to the plain wording until then.
export type ResolvedOption = { label: string; from?: 'run' | 'format' | 'profile' | 'channel' | 'default' };
export type ResolvedOptions = Partial<
  Record<'voice' | 'visualSource' | 'music' | 'targetSeconds' | 'videoKind' | 'formatKey', ResolvedOption>
>;

export function resolvedOptionsOf(data: unknown): ResolvedOptions | undefined {
  const raw = (data as { resolvedOptions?: unknown } | undefined)?.resolvedOptions;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: ResolvedOptions = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as { label?: unknown; from?: unknown } | null;
    if (v && typeof v.label === 'string' && v.label.trim()) {
      out[key as keyof ResolvedOptions] = { label: v.label, from: typeof v.from === 'string' ? (v.from as ResolvedOption['from']) : undefined };
    }
  }
  return out;
}

export type GateDecisionEntry = {
  gate: 1 | 2;
  outcome: string;
  decidedBy?: 'user' | 'auto';
  privacyStatus?: string;
};

/** Oldest first, as the backend sends them. Undefined while the backend field does not exist. */
export function gateDecisionsOf(data: unknown): GateDecisionEntry[] | undefined {
  const raw = (data as { gateDecisions?: unknown } | undefined)?.gateDecisions;
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (d): d is GateDecisionEntry =>
      !!d && typeof d === 'object' && ((d as { gate?: unknown }).gate === 1 || (d as { gate?: unknown }).gate === 2) && typeof (d as { outcome?: unknown }).outcome === 'string',
  );
}

/** USD spent on the run; undefined (never 0) while the backend does not send it. */
export function spentUsdOf(data: unknown): number | undefined {
  const v = (data as { spentUsd?: unknown } | undefined)?.spentUsd;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

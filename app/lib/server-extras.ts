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

// Sprint 4 Task 10: `runs.get.chapterWarning` is sent for a long run when the chapter list cannot meet YouTube's
// rules, but the server's declared response type (`LongFormRunFields`) does not list it, so it is read here.
export function chapterWarningOf(data: unknown): string | undefined {
  const v = (data as { chapterWarning?: unknown } | undefined)?.chapterWarning;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

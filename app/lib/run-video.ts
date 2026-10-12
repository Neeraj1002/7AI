// Sprint 4 FE N3 R3/R4 — a runs.list row carries creationOptions: a long run stores videoKind 'long' and its resolved
// targetDurationSec. This turns that into the props of the "Video · n min" chip. A Short yields no chip.
export function chipFromRun(run: { creationOptions?: unknown } | null | undefined): {
  videoKind: string | undefined;
  targetSeconds: number | undefined;
} {
  const o = (run?.creationOptions ?? {}) as { videoKind?: unknown; targetDurationSec?: unknown };
  return {
    videoKind: typeof o.videoKind === 'string' ? o.videoKind : undefined,
    targetSeconds: typeof o.targetDurationSec === 'number' ? o.targetDurationSec : undefined,
  };
}

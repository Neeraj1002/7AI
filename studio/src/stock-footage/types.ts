// This project's own stock-footage request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape, per Week
// 4 Task 1's instruction to replicate that boundary pattern.

export const STOCK_FOOTAGE_PURPOSES = ['stock-search'] as const;
export type StockFootagePurpose = (typeof STOCK_FOOTAGE_PURPOSES)[number];

export const STOCK_FOOTAGE_PROVIDERS = ['pexels'] as const;
export type StockFootageProvider = (typeof STOCK_FOOTAGE_PROVIDERS)[number];

export type SearchClipParams = {
  query: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  minDurationSeconds?: number;
};

export type StockClip = {
  clipPath: string;
  durationSeconds: number;
  sourceId: string; // provider's own video id, for traceability
  sourceUrl: string; // provider's page URL — Pexels doesn't require attribution, kept anyway
  costUsd: string; // NUMERIC as string, matching UsageEvent.costUsd's DB representation — always '0.000000', Pexels is free
};

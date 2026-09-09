// Public surface of the stock-footage capability layer. Call sites import
// only from here — never from client.ts or registry.ts directly — mirroring
// studio/src/media/'s import-boundary pattern.

import { searchAndDownloadClipViaProvider } from './client';
import { stubSearchAndDownloadClip } from './stub';
import { env } from '../config/env';
import type { SearchClipParams, StockClip } from './types';

export type { StockFootagePurpose, StockFootageProvider, SearchClipParams, StockClip } from './types';

// STOCK_FOOTAGE_STUB=1 swaps the real Pexels call for the stub in ./stub.ts —
// no PEXELS_API_KEY has been available in any session so far. Same pattern
// MEDIA_STUB uses, applied at this layer's own public surface so the
// production-planning/assembly steps never need to know or care which mode
// is active.
export async function searchStockFootage(params: SearchClipParams): Promise<StockClip> {
  if (env.STOCK_FOOTAGE_STUB === '1') {
    return stubSearchAndDownloadClip(params);
  }
  return searchAndDownloadClipViaProvider(params);
}

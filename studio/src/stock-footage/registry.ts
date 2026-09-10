import type { StockFootageProvider, StockFootagePurpose } from './types';

export type RegistryEntry = {
  provider: StockFootageProvider;
};

// Purpose -> provider, mirroring studio/src/media/registry.ts's shape — one
// provider today (Pexels, per the decision doc's recommendation: free,
// commercial-use license, no attribution required), keeping a later Pixabay
// swap or fallback a registry change, not a call-site rewrite.
export const STOCK_FOOTAGE_REGISTRY: Record<StockFootagePurpose, RegistryEntry> = {
  'stock-search': { provider: 'pexels' },
};

export function resolveStockFootagePurpose(purpose: StockFootagePurpose): RegistryEntry {
  return STOCK_FOOTAGE_REGISTRY[purpose];
}

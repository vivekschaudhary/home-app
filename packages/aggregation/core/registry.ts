// Runtime provider selection. The app registers Plaid today; a 2nd provider
// (KR2) is `registry.register(createMxProvider())` — additive, no rewrite. The
// persisted `account_connections.provider` routes an existing connection to its
// adapter at sync time.

import type { AggregationProvider } from "./provider";

export interface ProviderRegistry {
  get(id: string): AggregationProvider;
  register(p: AggregationProvider): void;
  ids(): string[];
}

export function createProviderRegistry(initial: AggregationProvider[] = []): ProviderRegistry {
  const map = new Map<string, AggregationProvider>();
  for (const p of initial) map.set(p.id, p);
  return {
    get(id) {
      const p = map.get(id);
      if (!p) throw new Error(`[aggregation] unknown provider: ${id}`);
      return p;
    },
    register(p) {
      map.set(p.id, p);
    },
    ids() {
      return [...map.keys()];
    },
  };
}

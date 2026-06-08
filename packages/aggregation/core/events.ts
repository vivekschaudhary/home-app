// Aggregation lifecycle events. The app wires an `onEvent` hook to map these onto
// its audit + funnel contracts (the WLT-5 activation metric) — the package itself
// stores no observability data. Errors in the hook are swallowed (best-effort).

export type AggregationEvent =
  | { type: "connection_linked"; userId: string; provider: string }
  | { type: "transactions_ingested"; userId: string; count: number }
  | { type: "sync_completed"; userId: string; connectionId: string; transactionCount: number }
  | { type: "connection_error"; userId: string; code: string }
  | { type: "connection_removed"; userId: string };

export type OnAggregationEvent = (event: AggregationEvent) => void | Promise<void>;

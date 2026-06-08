// @wealth/aggregation — provider-neutral account aggregation (WLT-2).
// Pluggable seams: AggregationProvider (Plaid adapter at ./plaid), TokenVault
// (Supabase Vault default at ./vault), ProviderRegistry, ingestTransactions.
// CSV/email import + a 2nd provider plug into the same seams — additive, no rewrite.
export * from "./core";

// @wealth/aggregation core — provider-neutral seams + pure logic. ZERO runtime
// deps beyond node:crypto + the Supabase service client (for ingest/vault impls).
// Never imports Plaid — that lives only in `@wealth/aggregation/plaid`.
export * from "./types";
export * from "./provider";
export * from "./vault";
export * from "./events";
export * from "./dedup";
export * from "./registry";
export * from "./ingest";

// Provider-neutral domain types. Money is decimal-as-string end-to-end (stored
// `numeric` in Postgres) — never a JS number (float drift on cents).

export type AccountKind = "depository" | "credit"; // Phase 1 only
export type TransactionDirection = "debit" | "credit"; // debit = money out, credit = money in
export type ConnectionHealth = "active" | "needs_reauth" | "error";

/** WLT-22-5 (AC8) — the NORMALIZED transfer/payment classification. Each provider
 * adapter maps its own taxonomy → this; the budget/recap/anomaly computes branch
 * on `kind`, never on a raw provider category string, so a non-US aggregator drives
 * the same transfer-exclusion by emitting `kind`. `payment` = a credit-card payment
 * (the double-count leg); `transfer` = internal money movement; both are excluded
 * from spending. `spend`/`income`/`fee` count (income is a credit, never spending). */
export type TransactionKind = "spend" | "transfer" | "payment" | "income" | "fee";

export interface NormalizedAccount {
  providerAccountId: string; // opaque, provider-scoped
  name: string;
  kind: AccountKind;
  currency: string; // ISO 4217
  balanceCurrent: string | null; // decimal-as-string
  balanceAvailable: string | null;
  mask: string | null; // last 4
}

export interface NormalizedTransaction {
  providerTransactionId: string | null; // opaque; null for CSV/manual sources
  providerAccountId: string | null; // WLT-27-3: null for CSV/manual sources; Plaid always non-null
  amount: string; // decimal-as-string, unsigned
  direction: TransactionDirection;
  currency: string;
  description: string;
  merchant: string | null;
  /** WLT-22-4 — the provider's STABLE merchant id (Plaid `merchant_entity_id`),
   * consistent across a merchant's transactions regardless of display name. Null/
   * absent when the provider can't identify a merchant (or a non-Plaid source).
   * The primary rule-match key. */
  merchantEntityId?: string | null;
  category: string | null;
  /** WLT-22-5 (AC8) — normalized transfer/payment classification, set by the
   * provider adapter from its taxonomy (the only place a provider string is read
   * for this). Defaults to 'spend' for non-Plaid sources that don't classify. */
  kind: TransactionKind;
  occurredOn: string; // ISO date (YYYY-MM-DD) — provider posted date, no TZ
  pending: boolean;
  /** Set by the SOURCE ("plaid" | "csv" | "email") — drives a source-aware dedup key. */
  source: string;
}

// Provider-neutral domain types. Money is decimal-as-string end-to-end (stored
// `numeric` in Postgres) — never a JS number (float drift on cents).

export type AccountKind = "depository" | "credit"; // Phase 1 only
export type TransactionDirection = "debit" | "credit"; // debit = money out, credit = money in
export type ConnectionHealth = "active" | "needs_reauth" | "error";

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
  providerAccountId: string;
  amount: string; // decimal-as-string, unsigned
  direction: TransactionDirection;
  currency: string;
  description: string;
  merchant: string | null;
  category: string | null;
  occurredOn: string; // ISO date (YYYY-MM-DD) — provider posted date, no TZ
  pending: boolean;
  /** Set by the SOURCE ("plaid" | "csv" | "email") — drives a source-aware dedup key. */
  source: string;
}

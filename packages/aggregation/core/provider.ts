// The pluggable provider seam. Plaid is one implementation (`@wealth/aggregation/plaid`);
// a 2nd provider (MX/Teller) is an additive registration, not a rewrite.
//
// Design rule: the provider is a PURE protocol translator — it NEVER touches the
// vault or the database. The caller reads the access secret from the TokenVault
// and passes it in. This keeps adapters trivially fakeable for tests.

import type { ConnectionHealth, NormalizedAccount, NormalizedTransaction } from "./types";

export interface LinkSession {
  /** Opaque token the client widget consumes (e.g. Plaid link_token). */
  clientToken: string;
  expiresAt: string; // ISO
}

export interface LinkCompletion {
  providerConnectionId: string; // opaque (e.g. Plaid item id)
  accessSecret: string; // the durable token to vault — never persisted in a table
  institution: { id: string | null; name: string | null };
}

export interface FetchTransactionsPage {
  added: NormalizedTransaction[];
  modified: NormalizedTransaction[];
  removed: string[]; // providerTransactionIds the institution reversed/withdrew
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AggregationProvider {
  /** Stable id, persisted as `account_connections.provider` + used by the registry. */
  readonly id: string;

  createLinkSession(input: { userId: string; redirectUri?: string }): Promise<LinkSession>;

  /** Exchange the client public artifact for the durable grant. */
  completeLink(input: { publicToken: string; userId: string }): Promise<LinkCompletion>;

  fetchAccounts(input: { accessSecret: string }): Promise<NormalizedAccount[]>;

  /** Incremental, cursor-driven delta sync (added/modified/removed). */
  fetchTransactions(input: {
    accessSecret: string;
    cursor: string | null;
  }): Promise<FetchTransactionsPage>;

  getConnectionStatus(input: { accessSecret: string }): Promise<ConnectionHealth>;

  /** Revoke the grant provider-side (idempotent). */
  removeConnection(input: { accessSecret: string }): Promise<void>;
}

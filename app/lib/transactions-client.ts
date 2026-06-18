// WLT-23-1 — browser-side calls to the transactions route. try/catch,
// discriminated returns, no exceptions thrown (the budget-client.ts pattern).

// One ledger row — the all-accounts activity item. `amount` is the positive
// magnitude; `direction` carries the sign (a credit renders with a leading "+").
// `category` is the WLT-22 RESOLVED category ("" = the null-category "Other"
// bucket); `account` is the account display name ("" = unknown).
export interface TransactionRowDTO {
  id: string;
  occurredOn: string; // 'YYYY-MM-DD'
  merchant: string | null;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  category: string;
  account: string;
  pending: boolean;
}

export interface TransactionsPageDTO {
  rows: TransactionRowDTO[];
  nextCursor: string | null; // opaque keyset cursor; null = no more pages
  hasAccount: boolean; // false = the user has no connected account (drives the connect nudge)
}

/**
 * One page of the ledger. `cursor` is the opaque value from a prior page's
 * `nextCursor` (omit for the first page); `q` is the free-text search. Keyset
 * pagination — never an unbounded fetch (the 24-month-history guardrail).
 */
export async function fetchTransactions(params: {
  cursor?: string | null;
  q?: string;
}): Promise<{ ok: true; page: TransactionsPageDTO } | { ok: false }> {
  try {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.q && params.q.trim()) qs.set("q", params.q.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`/api/transactions${suffix}`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const page = (await res.json()) as TransactionsPageDTO;
    return { ok: true, page };
  } catch {
    return { ok: false };
  }
}

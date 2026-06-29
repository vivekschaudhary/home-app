// WLT-23-1 — browser-side calls to the transactions route. try/catch,
// discriminated returns, no exceptions thrown (the budget-client.ts pattern).

// One ledger row — the all-accounts activity item. `amount` is the positive
// magnitude; `direction` carries the sign (a credit renders with a leading "+").
// `category` is the WLT-22 RESOLVED category ("" = the null-category "Other"
// bucket); `account` is the account display name ("" = unknown).
export interface TransactionRowDTO {
  id: string;
  dedupKey: string; // WLT-23-3 — the stable key the recategorize write targets
  occurredOn: string; // 'YYYY-MM-DD'
  merchant: string | null;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  category: string;
  account: string;
  pending: boolean;
  isSubscription: boolean; // WLT-24-1 — the user marked this charge as a subscription
  followupStatus: "open" | "done" | null; // WLT-25-1/2 — follow-up state (open / resolved / none)
}

// WLT-23-2 — an account option for the account filter (the user's own accounts).
export interface LedgerAccountDTO {
  id: string;
  name: string;
}

export interface TransactionsPageDTO {
  rows: TransactionRowDTO[];
  nextCursor: string | null; // opaque keyset cursor; null = no more pages
  hasAccount: boolean; // false = the user has no connected account (drives the connect nudge)
  accounts: LedgerAccountDTO[]; // WLT-23-2 — the account-filter options (owner-scoped)
  hasOther: boolean; // WLT-23-2 — the null-category "Other" bucket exists (gates the filter option)
}

/**
 * One page of the ledger. `cursor` is the opaque value from a prior page's
 * `nextCursor` (omit for the first page); `q` is the free-text search;
 * `accountId` + `category` are the WLT-23-2 filters (`category` is the RESOLVED
 * category name, `""` = the null-category "Other" bucket; omit/`null` = all);
 * `month` is the WLT-26-1 month filter ('YYYY-MM'; absent = all dates).
 * Keyset pagination — never an unbounded fetch (the 24-month-history guardrail).
 */
export async function fetchTransactions(params: {
  cursor?: string | null;
  q?: string;
  accountId?: string | null;
  category?: string | null;
  followup?: "open" | "done" | null; // WLT-25-1/2 — charges with an open / done follow-up
  month?: string | null; // WLT-26-1 — 'YYYY-MM' bounds occurred_on to a calendar month
  currency?: string | null; // WLT-27-5 — ISO 4217 currency scope (absent = no filter)
}): Promise<{ ok: true; page: TransactionsPageDTO } | { ok: false }> {
  try {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.q && params.q.trim()) qs.set("q", params.q.trim());
    if (params.accountId) qs.set("account", params.accountId);
    // category present (even "") = a filter; absent/null = all categories.
    if (params.category !== null && params.category !== undefined) qs.set("category", params.category);
    if (params.followup) qs.set("followup", params.followup); // WLT-25-1/2 — "open" | "done"
    if (params.month) qs.set("month", params.month); // WLT-26-1 — 'YYYY-MM' month filter
    if (params.currency) qs.set("currency", params.currency); // WLT-27-5 — currency scope
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`/api/transactions${suffix}`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const page = (await res.json()) as TransactionsPageDTO;
    return { ok: true, page };
  } catch {
    return { ok: false };
  }
}

/** Fire-and-forget: record that the user applied a ledger filter (WLT-23-2). */
export function recordTransactionsFiltered(): void {
  try {
    void fetch("/api/transactions/filtered", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* non-blocking — instrumentation must never break the UI */
  }
}

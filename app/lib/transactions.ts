// WLT-23-1 — the Transactions ledger read: ALL the user's transactions across
// all accounts, owner-scoped under their RLS session, newest first, KEYSET-
// paginated (never one unbounded fetch — the 24-month-history guardrail + the
// 1000-row PostgREST cap). The category column is the WLT-22 RESOLVED value
// (saved ?? Plaid) via the one shared `readCategoryAssignments` map, so it never
// disagrees with the budget. The /transactions RSC reads page 1 on every load
// (force-dynamic → reconcile-on-load, the #36 / [real-path-integration-coverage]
// seam); search + Load-more go through the route handler.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { effectiveCategory } from "@wealth/core";
import { readCategoryAssignments } from "@wealth/db/categories";
import type { LedgerAccountDTO, TransactionRowDTO } from "./transactions-client";

export const PAGE_SIZE = 50; // keeps each keyset query well under the 1000-row cap
// WLT-23-2 — bound the resolved-category filter's over-fetch scan (≤ this many
// rows read per request) so a selective filter can never become an unbounded scan.
const MAX_SCAN_ROWS = 20 * PAGE_SIZE;

export interface TransactionsPage {
  rows: TransactionRowDTO[];
  nextCursor: string | null;
  hasAccount: boolean;
  accounts: LedgerAccountDTO[];
}
export type TransactionsPageResult = { ok: true; page: TransactionsPage } | { ok: false };

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

// The cursor's two fields are interpolated into the PostgREST `.or(...)` filter
// grammar, so they MUST be shape-validated before use — a crafted cursor could
// otherwise alter the predicate or force a 502 (RLS still blocks cross-tenant
// reads, but this keeps the public route contract robust). `occurred_on` is a
// DATE; `id` is the transactions PK (uuid). Anything else → treat as page 1.
const CURSOR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque keyset cursor for the last row on a page: `(occurred_on, id)`. */
export function encodeCursor(row: { occurredOn: string; id: string }): string {
  return Buffer.from(`${row.occurredOn}|${row.id}`, "utf8").toString("base64url");
}
/**
 * Decode a cursor back to `(occurredOn, id)`; null if malformed OR if either
 * field doesn't match its strict shape (date / uuid) — so a hostile cursor can
 * never reach the `.or(...)` filter and a bad cursor degrades cleanly to page 1.
 */
export function decodeCursor(cursor: string | null | undefined): { occurredOn: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    const occurredOn = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!CURSOR_DATE_RE.test(occurredOn) || !CURSOR_ID_RE.test(id)) return null;
    return { occurredOn, id };
  } catch {
    return null;
  }
}

/**
 * Sanitize a free-text search term for a PostgREST `.or(...)` `ilike` filter.
 * The `.or()` grammar is comma/paren-delimited and `%`/`*` are wildcards, so a
 * user term carrying those would break the filter (or inject extra predicates).
 * Strip them — leaving the wrapping `%term%` we add — and bound the length.
 */
export function sanitizeSearch(q: string | null | undefined): string {
  return (q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 100);
}

/** Clamp a requested page size into a sane bound (defends a hostile `limit`). */
export function clampLimit(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n) || n <= 0) return PAGE_SIZE;
  return Math.min(Math.floor(n), PAGE_SIZE);
}

// ── The read ────────────────────────────────────────────────────────────────

/**
 * One page of the ledger. Keyset over `(occurred_on desc, id desc)`: the next
 * page is rows strictly "older than" the cursor. RLS already hides superseded /
 * removed (CDC) rows. Account name comes from a small owner-scoped
 * `financial_accounts` map (avoids PostgREST embedding ambiguity, mirrors
 * `readCategoryAssignments`); `hasAccount` distinguishes "no connected account"
 * from "connected, no transactions" for the empty states.
 */
type TxnRow = {
  id: string;
  occurred_on: string;
  merchant: string | null;
  description: string;
  amount: number | string;
  direction: "debit" | "credit";
  category: string | null;
  dedup_key: string;
  pending: boolean | null;
  account_id: string | null;
};
const SELECT_COLS = "id, occurred_on, merchant, description, amount, direction, category, dedup_key, pending, account_id";

export async function readTransactionsPage(
  userId: string,
  opts: { cursor?: string | null; search?: string | null; accountId?: string | null; category?: string | null; limit?: number } = {},
): Promise<TransactionsPageResult> {
  const supabase = await createServerSupabase();
  const limit = clampLimit(opts.limit);
  const search = sanitizeSearch(opts.search);
  // Account filter: a uuid (validated like the cursor id) or ignored — no raw
  // value reaches the filter grammar.
  const accountId = opts.accountId && CURSOR_ID_RE.test(opts.accountId) ? opts.accountId : null;
  // Category filter (RESOLVED name): present (incl. "" = the Other bucket) = a
  // filter; null/undefined = all categories.
  const category = opts.category ?? null;

  // Shared owner-scoped reads: the saved-category map + the account names (also the
  // account-filter options + `hasAccount` for the empty state).
  const [assignments, accountsRes] = await Promise.all([
    readCategoryAssignments(supabase, userId),
    supabase.from("financial_accounts").select("id, name").eq("user_id", userId),
  ]);
  const accountName = new Map<string, string>();
  for (const a of (accountsRes.data ?? []) as { id: string; name: string }[]) accountName.set(a.id, a.name);
  const accounts: LedgerAccountDTO[] = [...accountName.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasAccount = accountName.size > 0;

  const mapRow = (r: TxnRow): TransactionRowDTO => ({
    id: r.id,
    occurredOn: r.occurred_on,
    merchant: r.merchant,
    description: r.description,
    amount: Number(r.amount),
    direction: r.direction === "credit" ? "credit" : "debit",
    category: effectiveCategory(r.category, assignments.get(r.dedup_key)) ?? "",
    account: (r.account_id && accountName.get(r.account_id)) || "",
    pending: r.pending === true,
  });

  // One keyset chunk starting strictly after `from` — account + search applied in
  // SQL (keyset-safe; `from` is a validated date+uuid).
  const fetchChunk = (from: { occurredOn: string; id: string } | null, take: number) => {
    let q = supabase
      .from("transactions")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false })
      .limit(take);
    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.or(`occurred_on.lt.${from.occurredOn},and(occurred_on.eq.${from.occurredOn},id.lt.${from.id})`);
    if (search) q = q.or(`merchant.ilike.%${search}%,description.ilike.%${search}%`);
    return q;
  };

  // No category filter → the simple keyset path (the common case; the WLT-23-1 shape).
  if (category === null) {
    const { data, error } = await fetchChunk(decodeCursor(opts.cursor), limit + 1);
    if (error) return { ok: false };
    const fetched = (data ?? []) as TxnRow[];
    const hasMore = fetched.length > limit;
    const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ occurredOn: last.occurred_on, id: last.id }) : null;
    return { ok: true, page: { rows: pageRows.map(mapRow), nextCursor, hasAccount, accounts } };
  }

  // Resolved-category filter → a BOUNDED over-fetch-and-filter keyset scan: read
  // chunks (account + search already narrowed in SQL), resolve each row's category
  // in JS (NO category/dedup_key value reaches the filter grammar — injection-safe),
  // keep matches until the page is full, the data is exhausted, or the scan cap is
  // hit. The cursor advances by the LAST ROW SCANNED so Load-more resumes exactly
  // where scanning stopped.
  const matched: TransactionRowDTO[] = [];
  let cursor = decodeCursor(opts.cursor);
  let scanned = 0;
  let exhausted = false;
  while (matched.length < limit && scanned < MAX_SCAN_ROWS) {
    const { data, error } = await fetchChunk(cursor, PAGE_SIZE);
    if (error) return { ok: false };
    const chunk = (data ?? []) as TxnRow[];
    if (chunk.length === 0) {
      exhausted = true;
      break;
    }
    for (const r of chunk) {
      scanned++;
      cursor = { occurredOn: r.occurred_on, id: r.id }; // advance past this row
      const row = mapRow(r);
      if (row.category === category) matched.push(row);
      if (matched.length >= limit) break;
    }
    if (chunk.length < PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }
  // Unless the data was exhausted (a filled page or the scan cap → hand back the
  // cursor so Load-more continues), there may be more matches.
  const nextCursor = !exhausted && cursor ? encodeCursor(cursor) : null;
  return { ok: true, page: { rows: matched, nextCursor, hasAccount, accounts } };
}

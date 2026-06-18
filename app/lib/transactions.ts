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
import type { TransactionRowDTO } from "./transactions-client";

export const PAGE_SIZE = 50; // keeps each keyset query well under the 1000-row cap

export interface TransactionsPage {
  rows: TransactionRowDTO[];
  nextCursor: string | null;
  hasAccount: boolean;
}
export type TransactionsPageResult = { ok: true; page: TransactionsPage } | { ok: false };

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Opaque keyset cursor for the last row on a page: `(occurred_on, id)`. */
export function encodeCursor(row: { occurredOn: string; id: string }): string {
  return Buffer.from(`${row.occurredOn}|${row.id}`, "utf8").toString("base64url");
}
/** Decode a cursor back to `(occurredOn, id)`; null if malformed (treated as page 1). */
export function decodeCursor(cursor: string | null | undefined): { occurredOn: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep < 0) return null;
    const occurredOn = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!occurredOn || !id) return null;
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
export async function readTransactionsPage(
  userId: string,
  opts: { cursor?: string | null; search?: string | null; limit?: number } = {},
): Promise<TransactionsPageResult> {
  const supabase = await createServerSupabase();
  const limit = clampLimit(opts.limit);
  const cursor = decodeCursor(opts.cursor);
  const search = sanitizeSearch(opts.search);

  let query = supabase
    .from("transactions")
    .select("id, occurred_on, merchant, description, amount, direction, category, dedup_key, pending, account_id")
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // +1 row → detect "has more" without a count

  // Keyset: occurred_on < c.date OR (occurred_on = c.date AND id < c.id).
  if (cursor) {
    query = query.or(
      `occurred_on.lt.${cursor.occurredOn},and(occurred_on.eq.${cursor.occurredOn},id.lt.${cursor.id})`,
    );
  }
  // Search ANDs with the keyset (separate .or() calls combine with AND).
  if (search) {
    query = query.or(`merchant.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const [{ data, error }, assignments, accounts] = await Promise.all([
    query,
    readCategoryAssignments(supabase, userId),
    supabase.from("financial_accounts").select("id, name").eq("user_id", userId),
  ]);
  if (error) return { ok: false }; // a query/RLS/db failure must NOT masquerade as "no transactions"

  const accountName = new Map<string, string>();
  for (const a of (accounts.data ?? []) as { id: string; name: string }[]) accountName.set(a.id, a.name);

  const fetched = (data ?? []) as {
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
  }[];

  const hasMore = fetched.length > limit;
  const pageRows = hasMore ? fetched.slice(0, limit) : fetched;

  const rows: TransactionRowDTO[] = pageRows.map((r) => ({
    id: r.id,
    occurredOn: r.occurred_on,
    merchant: r.merchant,
    description: r.description,
    amount: Number(r.amount),
    direction: r.direction === "credit" ? "credit" : "debit",
    category: effectiveCategory(r.category, assignments.get(r.dedup_key)) ?? "",
    account: (r.account_id && accountName.get(r.account_id)) || "",
    pending: r.pending === true,
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ occurredOn: last.occurred_on, id: last.id }) : null;

  return { ok: true, page: { rows, nextCursor, hasAccount: accountName.size > 0 } };
}

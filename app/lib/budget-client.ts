// WLT-21-1 — browser-side calls to the budget routes. try/catch, discriminated
// returns, no exceptions thrown (the aggregation-client.ts pattern).

import type { BudgetRow } from "@wealth/core";

export interface BudgetViewDTO {
  rows: BudgetRow[];
  asOfMonth: string;
  typicalMonthlyTotal: number | null;
  hasData: boolean;
  series: Record<string, number[]>;
  seriesMonths: string[];
  /** WLT-22-5: count of this-month txns set aside as non-spending — drives the nudge. */
  setAsideCount: number;
}

export type BudgetError = "invalid" | "server" | "network";

/** Reconcile-on-mount read (the #36 discipline — never trust stale props forever).
 *  WLT-27-5: `currency` must match the active region so the refreshed data stays
 *  consistent with what the SSR page rendered (without it, the mount refresh
 *  would silently return USD regardless of the user's selected currency). */
export async function fetchBudget(currency = "USD"): Promise<{ ok: true; view: BudgetViewDTO } | { ok: false }> {
  try {
    const url = currency !== "USD" ? `/api/budget?currency=${encodeURIComponent(currency)}` : "/api/budget";
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const view = (await res.json()) as BudgetViewDTO;
    return { ok: true, view };
  } catch {
    return { ok: false };
  }
}

export async function saveBudget(input: {
  category: string;
  limitAmount?: number;
  limitPercent?: number;
}): Promise<{ ok: true } | { ok: false; error: BudgetError }> {
  try {
    const res = await fetch("/api/budget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

// WLT-22-1 — the line items behind a category's "this month so far" number.
// WLT-22-2 adds `dedupKey` (the recategorize write target) + `category` (the
// item's resolved current category, to mark "current" in the picker).
export interface CategoryTxnDTO {
  dedupKey: string;
  occurredOn: string;
  merchant: string | null;
  description: string;
  amount: number;
  category: string;
}

// WLT-22-2 — a user-owned category (seeded from Plaid or custom).
export interface CategoryDTO {
  id: string;
  name: string;
  kind: "essential" | "discretionary";
  source: "seed" | "custom" | "system"; // WLT-22-5 — 'system' = the protected Transfers & Payments
  countsAsSpending: boolean; // WLT-22-5 — false ⇒ the "exclude from spending" target
}

// WLT-27-5: `currency` must match the active region so the drill total reconciles
// to the budget row (the "honesty contract" from WLT-22-1 — same filter as getBudgetView).
export async function fetchCategoryTransactions(
  category: string,
  month: string,
  currency = "USD",
): Promise<{ ok: true; items: CategoryTxnDTO[]; total: number } | { ok: false }> {
  try {
    const currencyParam = currency !== "USD" ? `&currency=${encodeURIComponent(currency)}` : "";
    const res = await fetch(
      `/api/budget/transactions?category=${encodeURIComponent(category)}&month=${encodeURIComponent(month)}${currencyParam}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { items: CategoryTxnDTO[]; total: number };
    return { ok: true, items: data.items, total: data.total };
  } catch {
    return { ok: false };
  }
}

// WLT-22-2 — the user's categories (for the recategorize picker; seeded on first GET).
export async function fetchCategories(): Promise<{ ok: true; categories: CategoryDTO[] } | { ok: false }> {
  try {
    const res = await fetch("/api/categories", { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { categories: CategoryDTO[] };
    return { ok: true, categories: data.categories };
  } catch {
    return { ok: false };
  }
}

// WLT-22-2 — create a custom category (to split a coarse group). `duplicate` is a
// distinct, surfaceable validation error.
export async function createCategory(
  name: string,
  kind: "essential" | "discretionary",
): Promise<{ ok: true; category: CategoryDTO } | { ok: false; error: "invalid" | "duplicate" | "server" | "network" }> {
  try {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "duplicate") return { ok: false, error: "duplicate" };
      return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    }
    const data = (await res.json()) as { category: CategoryDTO };
    return { ok: true, category: data.category };
  } catch {
    return { ok: false, error: "network" };
  }
}

// WLT-22-2/3 — save the user's category for one transaction (the per-transaction
// override), or — with `applyToMerchant` — "remember the merchant": a rule that
// backfills all matching transactions. Returns how many were written (`count`).
export async function recategorizeTransaction(input: {
  dedupKey: string;
  categoryId: string;
  applyToMerchant?: boolean;
}): Promise<{ ok: true; count: number } | { ok: false; error: BudgetError }> {
  try {
    const res = await fetch("/api/categories/recategorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    const data = (await res.json().catch(() => ({ count: 1 }))) as { count?: number };
    return { ok: true, count: typeof data.count === "number" ? data.count : 1 };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Fire-and-forget: record that the user expanded a category's year spread (WLT-21-2). */
export function recordSpreadViewed(): void {
  try {
    void fetch("/api/budget/spread-viewed", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* non-blocking — instrumentation must never break the UI */
  }
}

/** Fire-and-forget: record that the user opened a category's drill-down (WLT-22-1). */
export function recordDrilldownViewed(): void {
  try {
    void fetch("/api/budget/drilldown-viewed", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* non-blocking — instrumentation must never break the UI */
  }
}

export async function clearBudget(category: string): Promise<{ ok: true } | { ok: false; error: BudgetError }> {
  try {
    const res = await fetch(`/api/budget?category=${encodeURIComponent(category)}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

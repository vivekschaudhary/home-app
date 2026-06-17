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
}

export type BudgetError = "invalid" | "server" | "network";

/** Reconcile-on-mount read (the #36 discipline — never trust stale props forever). */
export async function fetchBudget(): Promise<{ ok: true; view: BudgetViewDTO } | { ok: false }> {
  try {
    const res = await fetch("/api/budget", { headers: { accept: "application/json" } });
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
export interface CategoryTxnDTO {
  occurredOn: string;
  merchant: string | null;
  description: string;
  amount: number;
}

export async function fetchCategoryTransactions(
  category: string,
  month: string,
): Promise<{ ok: true; items: CategoryTxnDTO[]; total: number } | { ok: false }> {
  try {
    const res = await fetch(
      `/api/budget/transactions?category=${encodeURIComponent(category)}&month=${encodeURIComponent(month)}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { items: CategoryTxnDTO[]; total: number };
    return { ok: true, items: data.items, total: data.total };
  } catch {
    return { ok: false };
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

export async function clearBudget(category: string): Promise<{ ok: true } | { ok: false; error: BudgetError }> {
  try {
    const res = await fetch(`/api/budget?category=${encodeURIComponent(category)}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

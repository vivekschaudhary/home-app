// WLT-21-1 — the Budget & Spending reads + writes, wired to Supabase. The
// COMPUTATIONS are pure in @wealth/core (budget.ts); this file reads the rows
// (owner-scoped, under the user's RLS session) and assembles the view. The
// /budget RSC calls getBudgetView on every load → reconcile-on-load, never stale
// props (the #36 / [real-path-integration-coverage] lesson). Persistence (save /
// clear) happens in the route-handler path, never in RSC render.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import {
  type BudgetRow,
  type SavedBudget,
  type SpendingTxn,
  buildBudgetRows,
  computeTypicalMonthlyTotal,
} from "@wealth/core";

// ~7 months: ≥6 complete months for the median-of-monthly-totals + the current
// partial month for "this month so far".
const TRAILING_DAYS = 215;

type Supa = Awaited<ReturnType<typeof createServerSupabase>>;

export interface BudgetView {
  rows: BudgetRow[];
  asOfMonth: string; // 'YYYY-MM'
  typicalMonthlyTotal: number | null; // the percent helper base ("≈ $X/mo")
  hasData: boolean; // any transactions at all (else the connect-an-account empty state)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The user's trailing ~7 months of transactions — owner-SELECT under the user's
 * RLS session (the policy already hides superseded/removed rows). Amounts /
 * category / direction / date only — no merchant or description (no PII).
 */
async function readSpendingForBudgets(userId: string, supabase: Supa): Promise<SpendingTxn[]> {
  const since = new Date(Date.now() - TRAILING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("transactions")
    .select("direction, category, amount, occurred_on")
    .eq("user_id", userId)
    .gte("occurred_on", since);
  return (data ?? []).map((r) => {
    const row = r as { direction: string; category: string | null; amount: number | string; occurred_on: string };
    return { direction: row.direction, category: row.category, amount: Number(row.amount), occurredOn: row.occurred_on };
  });
}

/** The user's budgets — owner-SELECT. */
async function readBudgets(userId: string, supabase: Supa): Promise<SavedBudget[]> {
  const { data } = await supabase
    .from("budgets")
    .select("category, limit_amount, limit_percent")
    .eq("user_id", userId);
  return (data ?? []).map((r) => {
    const row = r as { category: string; limit_amount: number | string | null; limit_percent: number | string | null };
    return {
      category: row.category,
      limitAmount: row.limit_amount == null ? null : Number(row.limit_amount),
      limitPercent: row.limit_percent == null ? null : Number(row.limit_percent),
    };
  });
}

/** Assemble the budget table view (read-only; the page emits budget_viewed). */
export async function getBudgetView(userId: string): Promise<BudgetView> {
  const supabase = await createServerSupabase();
  const [txns, budgets] = await Promise.all([
    readSpendingForBudgets(userId, supabase),
    readBudgets(userId, supabase),
  ]);
  const asOf = todayUtc();
  return {
    rows: buildBudgetRows({ budgets, txns, asOf }),
    asOfMonth: asOf.slice(0, 7),
    typicalMonthlyTotal: computeTypicalMonthlyTotal(txns, asOf),
    hasData: txns.length > 0,
  };
}

export type BudgetSaveResult = { ok: true } | { ok: false; error: "invalid" | "save_failed" };

/**
 * Set or update the user's budget for one category — owner-scoped (RLS). Exactly
 * one of amount/percent. Upsert on the `(user_id, category)` unique constraint
 * (insert, or update the existing cap — switching $↔% clears the other column).
 */
export async function saveBudgetForUser(input: {
  userId: string;
  category: string;
  limitAmount: number | null;
  limitPercent: number | null;
}): Promise<BudgetSaveResult> {
  const { userId, category } = input;
  if (!category || typeof category !== "string") return { ok: false, error: "invalid" };
  const hasAmount = input.limitAmount != null;
  const hasPercent = input.limitPercent != null;
  if (hasAmount === hasPercent) return { ok: false, error: "invalid" }; // exactly one
  const limitAmount = hasAmount ? Math.round((input.limitAmount as number) * 100) / 100 : null;
  const limitPercent = hasPercent ? Math.round((input.limitPercent as number) * 100) / 100 : null;
  if (limitAmount != null && !(limitAmount > 0)) return { ok: false, error: "invalid" };
  if (limitPercent != null && !(limitPercent > 0 && limitPercent <= 100)) return { ok: false, error: "invalid" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("budgets")
    .upsert(
      { user_id: userId, category, limit_amount: limitAmount, limit_percent: limitPercent },
      { onConflict: "user_id,category" },
    );
  if (error) return { ok: false, error: "save_failed" };
  return { ok: true };
}

/**
 * Clear the user's budget for a category — HARD delete (budgets_delete_own). Soft-
 * delete via the authenticated path is structurally impossible here (see 0010),
 * and a budget cap needs no audit trail.
 */
export async function clearBudgetForUser(input: { userId: string; category: string }): Promise<BudgetSaveResult> {
  if (!input.category) return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("user_id", input.userId)
    .eq("category", input.category);
  if (error) return { ok: false, error: "save_failed" };
  return { ok: true };
}

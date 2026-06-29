// WLT-12 — owner-scoped reads of the personalization inputs. Runs under the
// user's RLS session (createServerSupabase, owner-SELECT on financial tables) —
// the user reads their OWN data; no service-role on this path (bet architecture).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import type { AccountBalance } from "@wealth/core";

/**
 * Distinct ISO 4217 currency codes present in the user's financial accounts.
 * Used by the WLT-27-5 RegionSwitcher to determine whether the switcher should
 * be shown (hidden for single-currency users) and to populate the dropdown options.
 * Excludes soft-deleted accounts (deleted_at IS NOT NULL).
 */
export async function readDistinctCurrencies(userId: string): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("financial_accounts")
    .select("currency")
    .eq("user_id", userId)
    .is("deleted_at", null);
  const seen = new Set<string>();
  for (const r of (data ?? []) as { currency: string }[]) {
    if (r.currency) seen.add(r.currency);
  }
  return [...seen].sort();
}

/** The user's synced account balances (kind + current balance; no PII). */
export async function readAccountBalances(userId: string): Promise<AccountBalance[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("financial_accounts")
    .select("kind, balance_current")
    .eq("user_id", userId)
    .is("deleted_at", null);
  return (data ?? []).map((r) => {
    const row = r as { kind: string; balance_current: number | string | null };
    return {
      kind: row.kind,
      // numeric comes back as string via PostgREST — normalize.
      balanceCurrent: row.balance_current === null ? null : Number(row.balance_current),
    };
  });
}

// WLT-12 — owner-scoped reads of the personalization inputs. Runs under the
// user's RLS session (createServerSupabase, owner-SELECT on financial tables) —
// the user reads their OWN data; no service-role on this path (bet architecture).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import type { AccountBalance } from "@wealth/core";

/**
 * WLT-27-5: Distinct currencies from the user's financial_accounts.
 * Drives the RegionSwitcher — only users with >1 currency see the switcher.
 */
export async function readDistinctCurrencies(userId: string): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("financial_accounts")
    .select("currency")
    .eq("user_id", userId)
    .is("deleted_at", null);
  const unique = [...new Set((data ?? []).map((r) => (r as { currency: string }).currency).filter(Boolean))];
  return unique.sort();
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

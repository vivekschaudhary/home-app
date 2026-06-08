// Plaid → provider-neutral mapping. The ONLY place Plaid's wire shapes are known.
// Pure functions (no SDK, no I/O) so they're unit-testable against fixtures.

import type {
  AccountBase,
  Transaction as PlaidTransaction,
} from "plaid";
import type { AccountKind, NormalizedAccount, NormalizedTransaction } from "../core/types";

/** Plaid amounts are JS numbers; render as a fixed-decimal string for `numeric`. */
function money(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.abs(n).toFixed(2);
}

/** Only depository + credit are in Phase-1 scope; others are skipped by the caller. */
export function mapAccountKind(plaidType: string): AccountKind | null {
  if (plaidType === "depository") return "depository";
  if (plaidType === "credit") return "credit";
  return null; // loan / investment / other — out of scope
}

export function mapAccount(a: AccountBase): NormalizedAccount | null {
  const kind = mapAccountKind(String(a.type));
  if (!kind) return null;
  return {
    providerAccountId: a.account_id,
    name: a.name ?? a.official_name ?? "Account",
    kind,
    currency: a.balances.iso_currency_code ?? "USD",
    balanceCurrent: money(a.balances.current),
    balanceAvailable: money(a.balances.available),
    mask: a.mask ?? null,
  };
}

export function mapTransaction(t: PlaidTransaction): NormalizedTransaction {
  // Plaid: positive amount = money OUT (debit); negative = money IN (credit).
  const direction = t.amount >= 0 ? "debit" : "credit";
  const category =
    t.personal_finance_category?.primary ?? (t.category && t.category[0]) ?? null;
  return {
    providerTransactionId: t.transaction_id,
    providerAccountId: t.account_id,
    amount: money(t.amount) ?? "0.00",
    direction,
    currency: t.iso_currency_code ?? "USD",
    description: t.name ?? t.merchant_name ?? "Transaction",
    merchant: t.merchant_name ?? null,
    category,
    occurredOn: t.date, // already YYYY-MM-DD
    pending: Boolean(t.pending),
    source: "plaid",
  };
}

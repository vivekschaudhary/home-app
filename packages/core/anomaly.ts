// Anomaly detection (WLT-15 / WLT-18) — PURE, high-precision RULES over the
// user's own transactions + balances. No DB, no I/O → exhaustively unit-testable
// for precision (the trust guardrail: a wrong "worth a look" is worse than none).
// The daily scan (packages/jobs/recap/anomaly-scan.ts) feeds these the rows and
// persists the candidates; the recap surfaces the top open one.
//
// v1 ships TWO rules — `large_charge` and `low_balance` — done conservatively.
// `recurring_due` is DEFERRED (a weak recurring-payment detector is the exact
// false-positive risk the guardrail forbids; the rule set is pluggable, so it's a
// clean fast-follow, not a shaky third rule). See the WLT-18 DRI.

import { humanizeCategory } from "./recap";

/** A transaction the scan considers (amounts/enums/date only — no PII in/out). */
export interface AnomalyTxn {
  id: string;
  accountId: string;
  direction: string; // 'debit' | 'credit'
  category: string | null;
  amount: number;
  occurredOn: string; // 'YYYY-MM-DD'
}

/** An account balance the scan considers. */
export interface AnomalyAccount {
  id: string;
  kind: string; // 'depository' | 'credit'
  balanceCurrent: number | null;
}

export type AnomalyKind = "large_charge" | "low_balance";

/** A detected anomaly — what the scan INSERTs. `summary` is amounts/enums/date only. */
export interface AnomalyCandidate {
  kind: AnomalyKind;
  severity: "info" | "attention";
  accountId: string | null;
  transactionId: string | null;
  /** Display fields ONLY — amount + humanized category + date. NEVER merchant/description. */
  summary: { amount: number; category?: string; date?: string };
  dedupKey: string;
  detectedOn: string; // 'YYYY-MM-DD'
}

export interface DetectInput {
  transactions: readonly AnomalyTxn[];
  accounts: readonly AnomalyAccount[];
  asOf: string; // 'YYYY-MM-DD'
}

// Conservative thresholds (Engineer escalation point — start high-precision).
const LARGE_CHARGE_MULTIPLE = 3; // ≥ 3× the category's own typical spend
const LARGE_CHARGE_FLOOR = 150; // and at least this absolute amount (skip noise)
const LARGE_CHARGE_MIN_HISTORY = 4; // need enough category history to call "usual"
const LARGE_CHARGE_RECENT_DAYS = 7; // only flag charges from the last week (timely)
const LOW_BALANCE_FLOOR = 100; // a depository account below this is "running low"

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${aIso}T00:00:00Z`) - Date.parse(`${bIso}T00:00:00Z`)) / DAY_MS);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Detect anomalies from the user's own history. High-precision, conservative.
 * Returns at most a handful — quality over recall. Deterministic + pure.
 */
export function detectAnomalies(input: DetectInput): AnomalyCandidate[] {
  const out: AnomalyCandidate[] = [];
  out.push(...largeCharges(input));
  out.push(...lowBalances(input));
  return out;
}

/**
 * A recent debit that is ≫ the user's OWN typical spend in that category. Needs
 * enough category history to have a baseline (no calling a charge "unusual" on a
 * brand-new category). One per qualifying recent transaction.
 */
function largeCharges({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const debits = transactions.filter((t) => t.direction === "debit");
  // Trailing baseline per category, EXCLUDING the recent window (so a spike in the
  // last week doesn't inflate its own baseline).
  const baselineByCat = new Map<string, number[]>();
  for (const t of debits) {
    if (daysBetween(asOf, t.occurredOn) > LARGE_CHARGE_RECENT_DAYS) {
      const key = t.category ?? "";
      const list = baselineByCat.get(key);
      if (list) list.push(t.amount);
      else baselineByCat.set(key, [t.amount]);
    }
  }
  const results: AnomalyCandidate[] = [];
  for (const t of debits) {
    const age = daysBetween(asOf, t.occurredOn);
    if (age < 0 || age > LARGE_CHARGE_RECENT_DAYS) continue; // recent only
    if (t.amount < LARGE_CHARGE_FLOOR) continue; // skip small charges
    const history = baselineByCat.get(t.category ?? "") ?? [];
    if (history.length < LARGE_CHARGE_MIN_HISTORY) continue; // not enough to call "usual"
    const baseline = median(history);
    if (baseline <= 0) continue;
    if (t.amount >= baseline * LARGE_CHARGE_MULTIPLE) {
      results.push({
        kind: "large_charge",
        severity: "attention",
        accountId: t.accountId,
        transactionId: t.id,
        summary: { amount: round2(t.amount), category: humanizeCategory(t.category), date: t.occurredOn },
        dedupKey: `large_charge:${t.id}`, // one per transaction, ever
        detectedOn: asOf,
      });
    }
  }
  return results;
}

/**
 * A depository account whose current balance is below the floor. Dedup'd per
 * account per month so we don't re-alert daily on a persistently-low account.
 */
function lowBalances({ accounts, asOf }: DetectInput): AnomalyCandidate[] {
  const month = asOf.slice(0, 7); // YYYY-MM
  const results: AnomalyCandidate[] = [];
  for (const a of accounts) {
    if (a.kind !== "depository") continue;
    if (a.balanceCurrent === null) continue;
    if (a.balanceCurrent < LOW_BALANCE_FLOOR) {
      results.push({
        kind: "low_balance",
        severity: "attention",
        accountId: a.id,
        transactionId: null,
        summary: { amount: round2(a.balanceCurrent) },
        dedupKey: `low_balance:${a.id}:${month}`,
        detectedOn: asOf,
      });
    }
  }
  return results;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

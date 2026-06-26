// Anomaly detection (WLT-15 / WLT-18) — PURE, high-precision RULES over the
// user's own transactions + balances. No DB, no I/O → exhaustively unit-testable
// for precision (the trust guardrail: a wrong "worth a look" is worse than none).
// The daily scan (packages/jobs/recap/anomaly-scan.ts) feeds these the rows and
// persists the candidates; the recap surfaces the top open one.
//
// Three rules, all CONSERVATIVE (precision over recall):
//   • large_charge  — a recent debit ≫ the user's own category baseline.
//   • low_balance   — a depository account under a floor.
//   • recurring_due — a tightly-regular monthly charge predicted due in the next
//     week. Strict regularity (≥3 occurrences, ~monthly gaps, consistent amount)
//     keeps it high-precision — the opposite of a naive recurring detector.

import { humanizeCategory } from "./recap";
import { normalizeMerchant } from "./categories";

/** A transaction the scan considers (amounts/enums/date only — no PII in/out). */
export interface AnomalyTxn {
  id: string;
  accountId: string;
  direction: string; // 'debit' | 'credit'
  category: string | null;
  amount: number;
  occurredOn: string; // 'YYYY-MM-DD'
  // WLT-26-2 additions — populated by the scan for the new detector rules.
  dedupKey: string; // CDC-stable transaction identity (used for new_merchant key)
  merchant?: string | null; // merchant name (resolved at display, never stored in summary)
}

/** An account balance the scan considers. */
export interface AnomalyAccount {
  id: string;
  kind: string; // 'depository' | 'credit'
  balanceCurrent: number | null;
}

export type AnomalyKind = "large_charge" | "recurring_due" | "low_balance" | "new_merchant" | "category_spike";

/** A detected anomaly — what the scan INSERTs. `summary` is amounts/enums/date only. */
export interface AnomalyCandidate {
  kind: AnomalyKind;
  severity: "info" | "attention";
  accountId: string | null;
  transactionId: string | null;
  /** Display fields ONLY — amounts + humanized category + date + projection fields.
   * NEVER merchant name or raw transaction description (PII invariant). */
  summary: {
    amount: number;
    category?: string;
    date?: string;
    // WLT-26-2 category_spike — projection metadata (no PII)
    baseline?: number;
    multiple?: number;
  };
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
// recurring_due — strict regularity (high precision, not a guesser):
const RECUR_MIN_OCCURRENCES = 3; // seen the pattern ≥ 3 times
const RECUR_GAP_MIN = 26; // every consecutive gap within a tight monthly band
const RECUR_GAP_MAX = 35;
const RECUR_AMOUNT_TOLERANCE = 0.1; // amounts within ±10%
const RECUR_DUE_WINDOW = 7; // predicted next charge due within the next week
const RECUR_MIN_AMOUNT = 20; // ignore trivial recurring charges
// WLT-26-2 — new dashboard detector constants (same escalation discipline).
const SPIKE_MULTIPLE = 1.75; // category on pace to exceed 1.75× its own median
const MIN_HISTORY_MONTHS = 2; // need ≥ 2 months to call any baseline meaningful

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${aIso}T00:00:00Z`) - Date.parse(`${bIso}T00:00:00Z`)) / DAY_MS);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
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
  out.push(...recurringDue(input));
  out.push(...lowBalances(input));
  out.push(...newMerchants(input)); // WLT-26-2
  out.push(...categorySpikes(input)); // WLT-26-2
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
 * A tightly-regular monthly charge predicted due within the next week. STRICT to
 * stay high-precision: ≥3 occurrences, EVERY consecutive gap in a tight monthly
 * band, amounts within ±10%, and the predicted next date within the next 7 days.
 * Grouped by (category, rounded amount). Dedup'd per predicted cycle (month).
 */
function recurringDue({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const groups = new Map<string, AnomalyTxn[]>();
  for (const t of transactions) {
    if (t.direction !== "debit") continue;
    if (t.amount < RECUR_MIN_AMOUNT) continue;
    const key = `${t.category ?? ""}|${Math.round(t.amount)}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const results: AnomalyCandidate[] = [];
  for (const [, txs] of groups) {
    if (txs.length < RECUR_MIN_OCCURRENCES) continue;
    const sorted = [...txs].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0));

    // Every consecutive gap must sit in the tight monthly band.
    const gaps: number[] = [];
    let regular = true;
    for (let i = 1; i < sorted.length; i++) {
      const gap = daysBetween(sorted[i].occurredOn, sorted[i - 1].occurredOn);
      if (gap < RECUR_GAP_MIN || gap > RECUR_GAP_MAX) {
        regular = false;
        break;
      }
      gaps.push(gap);
    }
    if (!regular) continue;

    // Amounts must be consistent (within ±10% of the mean).
    const amounts = sorted.map((t) => t.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (mean <= 0) continue;
    if (amounts.some((a) => Math.abs(a - mean) / mean > RECUR_AMOUNT_TOLERANCE)) continue;

    // Predict the next charge; flag only if it's due in the next week.
    const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const last = sorted[sorted.length - 1];
    const predicted = addDays(last.occurredOn, avgGap);
    const daysUntil = daysBetween(predicted, asOf);
    if (daysUntil < 0 || daysUntil > RECUR_DUE_WINDOW) continue;

    const amount = round2(median(amounts));
    results.push({
      kind: "recurring_due",
      severity: "info", // a heads-up — outranked by attention-level anomalies
      accountId: last.accountId,
      transactionId: null,
      summary: { amount, category: humanizeCategory(last.category), date: predicted },
      dedupKey: `recurring_due:${last.category ?? ""}:${Math.round(mean)}:${predicted.slice(0, 7)}`,
      detectedOn: asOf,
    });
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

// ── WLT-26-2 dashboard detector rules ────────────────────────────────────────

/**
 * Detect debut merchants — transactions at merchants with NO prior appearance
 * before the scan window. Conservative: only flags merchants first seen within
 * the last LARGE_CHARGE_RECENT_DAYS (7 days), so a merchant seen last week for
 * the first time is flagged; one seen two weeks ago but not before is not
 * (timely signal only). History gate: ≥ MIN_HISTORY_MONTHS distinct months of
 * debits required (too little history → meaningless "everything is new").
 *
 * PII invariant: `summary` carries amount + date ONLY — no merchant name.
 * The merchant is resolved at display-read time via the dedup_key join.
 */
function newMerchants({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const debits = transactions.filter((t) => t.direction === "debit");
  const curMonth = asOf.slice(0, 7);

  // History gate: need ≥ MIN_HISTORY_MONTHS distinct PRIOR calendar months
  // (months before the current month). This ensures the "new" flag is meaningful —
  // a debut merchant during the user's very first month is not worth flagging.
  const priorDebitsMonths = new Set(debits.filter((t) => t.occurredOn.slice(0, 7) < curMonth).map((t) => t.occurredOn.slice(0, 7)));
  if (priorDebitsMonths.size < MIN_HISTORY_MONTHS) return [];

  // Group by normalized merchant. For each, find earliest occurrence in the window.
  const byMerchant = new Map<string, AnomalyTxn[]>();
  for (const t of debits) {
    const key = normalizeMerchant(t.merchant);
    if (!key) continue; // skip blank/unidentifiable merchants
    const list = byMerchant.get(key);
    if (list) list.push(t);
    else byMerchant.set(key, [t]);
  }

  const results: AnomalyCandidate[] = [];
  for (const [, txs] of byMerchant) {
    // Sort by date ascending to find the debut.
    const sorted = [...txs].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : 1));
    const debut = sorted[0]!;
    const age = daysBetween(asOf, debut.occurredOn);

    // "New" = first appearance is within the recent window (last 7 days).
    if (age < 0 || age > LARGE_CHARGE_RECENT_DAYS) continue;

    // Emit one candidate per debut merchant. The dedup_key encodes the debut
    // transaction's stable identity so a merchant is flagged exactly once.
    results.push({
      kind: "new_merchant",
      severity: "info",
      accountId: debut.accountId,
      transactionId: debut.id,
      // summary: amounts/date ONLY — no merchant name (PII invariant, 0009 posture).
      summary: { amount: round2(debut.amount), date: debut.occurredOn },
      dedupKey: `new_merchant:${debut.dedupKey}`,
      detectedOn: asOf,
    });
  }
  return results;
}

/**
 * Detect categories where the current month is on pace to overspend the user's
 * rolling-median baseline by SPIKE_MULTIPLE (1.75×). Monthly dedup: the
 * dedup_key encodes the YYYY-MM, so each category re-evaluates fresh each month
 * (unlike large_charge/new_merchant which are per-transaction).
 *
 * History gate: each category needs ≥ MIN_HISTORY_MONTHS prior complete months
 * to establish a meaningful baseline. Global gate also applies (same as
 * newMerchants) via the overall months-of-history check.
 */
function categorySpikes({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const debits = transactions.filter((t) => t.direction === "debit");

  // Global history gate.
  const globalMonths = new Set(debits.map((t) => t.occurredOn.slice(0, 7)));
  if (globalMonths.size < MIN_HISTORY_MONTHS) return [];

  const curMonth = asOf.slice(0, 7);
  // Prior complete months: all months before curMonth that appear in the txns.
  const priorMonths = [...globalMonths].filter((m) => m < curMonth);

  // Per-category, per-month totals (current + prior).
  const byCatMonth = new Map<string, Map<string, number>>();
  for (const t of debits) {
    const cat = t.category ?? "";
    const month = t.occurredOn.slice(0, 7);
    let mm = byCatMonth.get(cat);
    if (!mm) {
      mm = new Map();
      byCatMonth.set(cat, mm);
    }
    mm.set(month, round2((mm.get(month) ?? 0) + t.amount));
  }

  // Day-of-month for projection arithmetic (at least 1 to avoid divide-by-zero).
  const dayOfMonth = Math.max(Number(asOf.slice(8, 10)), 1);
  const year = Number(asOf.slice(0, 4));
  const month0 = Number(asOf.slice(5, 7)) - 1; // 0-based for Date
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate(); // last day of curMonth

  const results: AnomalyCandidate[] = [];
  for (const [cat, mm] of byCatMonth) {
    const curTotal = mm.get(curMonth) ?? 0;
    if (curTotal <= 0) continue; // nothing spent this month in this category

    // Per-category prior-month totals (non-zero only — same robustness as the chart).
    const priorTotals = priorMonths.map((m) => mm.get(m) ?? 0).filter((v) => v > 0);
    if (priorTotals.length < MIN_HISTORY_MONTHS) continue; // need ≥2 non-zero prior months per category

    const baseline = median(priorTotals);
    if (baseline <= 0) continue; // can't spike against a zero baseline

    // On-pace projection: extrapolate the partial month to a full month.
    const projection = round2(curTotal * (daysInMonth / dayOfMonth));

    if (projection >= baseline * SPIKE_MULTIPLE) {
      results.push({
        kind: "category_spike",
        severity: "attention",
        accountId: null,
        transactionId: null,
        summary: {
          category: humanizeCategory(cat || null),
          amount: projection,
          baseline: round2(baseline),
          multiple: round2(projection / baseline),
        },
        // Monthly dedup: re-evaluates each month on fresh data (low_balance idiom).
        dedupKey: `category_spike:${cat}:${curMonth}`,
        detectedOn: asOf,
      });
    }
  }
  return results;
}

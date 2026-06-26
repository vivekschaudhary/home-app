// Anomaly detection (WLT-15 / WLT-18 / WLT-26-2) — PURE, high-precision RULES
// over the user's own transactions + balances. No DB, no I/O → exhaustively
// unit-testable for precision (the trust guardrail: a wrong "worth a look" is
// worse than none). The daily scan (packages/jobs/recap/anomaly-scan.ts) feeds
// these the rows and persists the candidates; the recap surfaces the top open
// one from the original 3 kinds; the dashboard intelligence panel surfaces the
// 2 new WLT-26-2 kinds (new_merchant, category_spike).
//
// Five rules, all CONSERVATIVE (precision over recall):
//   • large_charge     — a recent debit ≫ the user's own category baseline.
//   • low_balance      — a depository account under a floor.
//   • recurring_due    — a tightly-regular monthly charge predicted due soon.
//   • new_merchant     — WLT-26-2: a debit at a merchant with no prior history.
//   • category_spike   — WLT-26-2: a category on pace to exceed 1.75× the user's
//     rolling median. Dedup key encodes the month → monthly re-evaluation.

import { humanizeCategory } from "./recap";
import { normalizeMerchant } from "./categories";

/** A transaction the scan considers (amounts/enums/date only — no PII in/out). */
export interface AnomalyTxn {
  id: string;
  accountId: string;
  dedupKey: string; // CDC-stable identity (WLT-26-2: used to key new_merchant candidates)
  direction: string; // 'debit' | 'credit'
  category: string | null;
  merchant?: string | null; // WLT-26-2: for new_merchant detection; resolved at read (never in summary)
  amount: number;
  occurredOn: string; // 'YYYY-MM-DD'
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
  /** Display fields ONLY — amount + humanized category + date. NEVER merchant/description. */
  summary: { amount: number; category?: string; date?: string; baseline?: number; multiple?: number };
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
// WLT-26-2: dashboard intelligence detector constants.
const MIN_HISTORY_MONTHS = 2; // minimum distinct months of debits before either new detector fires
const SPIKE_MULTIPLE = 1.75; // category on pace to exceed 1.75× its rolling median → spike

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
  out.push(...newMerchants(input));
  out.push(...categorySpikes(input));
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

/**
 * WLT-26-2 — Debut merchants: a merchant with no prior occurrence in the scan
 * window whose earliest transaction is within the recent-flag window. Surfaces
 * one candidate per debut (keyed on the debut transaction's CDC-stable dedupKey
 * so it is permanent — a merchant is new exactly once). Summary carries NO
 * merchant name (PII invariant) — the dashboard reader resolves it at read time
 * via a live-transaction join on the stripped dedupKey.
 */
function newMerchants({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const debits = transactions.filter((t) => t.direction === "debit");

  // History gate: need ≥ MIN_HISTORY_MONTHS distinct calendar months of debits.
  const debitMonths = new Set(debits.map((t) => t.occurredOn.slice(0, 7)));
  if (debitMonths.size < MIN_HISTORY_MONTHS) return [];

  // Group all debits by normalized merchant key.
  const byMerchant = new Map<string, AnomalyTxn[]>();
  for (const t of debits) {
    const key = normalizeMerchant(t.merchant);
    if (!key) continue; // skip transactions with no identifiable merchant
    const list = byMerchant.get(key);
    if (list) list.push(t);
    else byMerchant.set(key, [t]);
  }

  const results: AnomalyCandidate[] = [];
  for (const [, txs] of byMerchant) {
    const sorted = [...txs].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0));
    const earliest = sorted[0];
    // The earliest occurrence must be within the recent flag window — a merchant
    // first seen more than LARGE_CHARGE_RECENT_DAYS ago isn't "new" anymore.
    const age = daysBetween(asOf, earliest.occurredOn);
    if (age < 0 || age > LARGE_CHARGE_RECENT_DAYS) continue;

    results.push({
      kind: "new_merchant",
      severity: "info",
      accountId: earliest.accountId,
      transactionId: earliest.id,
      // Summary: amount + date only. NO merchant name — resolved at read time.
      summary: { amount: round2(earliest.amount), date: earliest.occurredOn },
      dedupKey: `new_merchant:${earliest.dedupKey}`, // permanent: merchant is new once
      detectedOn: asOf,
    });
  }
  return results;
}

/**
 * WLT-26-2 — Category spend spikes: a category whose current-month spend is on
 * pace to exceed SPIKE_MULTIPLE × its rolling median of prior complete months.
 * Monthly dedup key → the spike re-evaluates on fresh data the next month. At
 * least MIN_HISTORY_MONTHS prior complete months required per category (the
 * statistical-meaningfulness floor). Average = median (robust to a one-off spike
 * inflating its own baseline, per architecture decision).
 */
function categorySpikes({ transactions, asOf }: DetectInput): AnomalyCandidate[] {
  const debits = transactions.filter((t) => t.direction === "debit");
  const currentMonth = asOf.slice(0, 7); // YYYY-MM

  // Build per-category monthly totals (current month + prior months separately).
  const currentByCat = new Map<string, number>(); // cat → current-month total
  const priorByCat = new Map<string, number[]>(); // cat → list of prior-month totals

  // Collect all unique prior months that appear in the data (for grouping totals).
  const priorMonthTotals = new Map<string, Map<string, number>>(); // cat → (month → total)

  for (const t of debits) {
    const cat = t.category ?? "";
    if (!cat) continue;
    const txMonth = t.occurredOn.slice(0, 7);
    if (txMonth === currentMonth) {
      currentByCat.set(cat, round2((currentByCat.get(cat) ?? 0) + t.amount));
    } else if (txMonth < currentMonth) {
      let mm = priorMonthTotals.get(cat);
      if (!mm) {
        mm = new Map();
        priorMonthTotals.set(cat, mm);
      }
      mm.set(txMonth, round2((mm.get(txMonth) ?? 0) + t.amount));
    }
  }

  // Flatten per-category prior month totals into arrays for median computation.
  for (const [cat, monthMap] of priorMonthTotals) {
    priorByCat.set(cat, [...monthMap.values()]);
  }

  // On-pace projection calendar helpers.
  const [yearStr, monthStr] = currentMonth.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const totalDaysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const dayOfMonth = Number(asOf.slice(8, 10));

  const results: AnomalyCandidate[] = [];
  for (const [cat, currentTotal] of currentByCat) {
    if (currentTotal === 0) continue;
    const priorTotals = priorByCat.get(cat) ?? [];
    if (priorTotals.length < MIN_HISTORY_MONTHS) continue; // not enough history
    const baseline = median(priorTotals);
    if (baseline <= 0) continue;

    const projection = currentTotal * (totalDaysInMonth / Math.max(dayOfMonth, 1));
    if (projection >= baseline * SPIKE_MULTIPLE) {
      results.push({
        kind: "category_spike",
        severity: "attention",
        accountId: null,
        transactionId: null,
        summary: {
          category: humanizeCategory(cat),
          amount: round2(projection),
          baseline: round2(baseline),
          multiple: round2(projection / baseline),
        },
        dedupKey: `category_spike:${cat}:${currentMonth}`, // monthly → re-evaluates next month
        detectedOn: asOf,
      });
    }
  }
  return results;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

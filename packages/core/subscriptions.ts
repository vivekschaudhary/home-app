// WLT-24-1 — the PURE subscriptions summary: given the user's marked recurring
// transactions, group them by normalized merchant and infer each subscription's
// typical amount + cadence, then a normalized monthly + annual headline total.
// No I/O — unit-testable against fixtures. The app layer reads the flagged txns
// (paginated) and hands them here; the compute never touches the category axis
// (orthogonality — a subscription is still real spend on the budget surfaces).

import { normalizeMerchant } from "./categories";

/** A transaction the user has marked as a subscription (the read passes these in). */
export interface MarkedTxn {
  dedupKey: string;
  merchant: string | null;
  description: string;
  amount: number; // unsigned, in dollars
  occurredOn: string; // 'YYYY-MM-DD'
}

/** `pending` = too few occurrences to infer; `irregular` = inferred but not a clean cycle. */
export type SubscriptionCadence = "weekly" | "monthly" | "annual" | "irregular" | "pending";

export interface SubscriptionRow {
  merchant: string; // display name (most-recent occurrence's merchant/description)
  normKey: string; // the normalizeMerchant grouping key
  typicalAmount: number; // median of the occurrences
  cadence: SubscriptionCadence;
  occurrences: number;
  /** Normalized monthly cost; null for `pending`/`irregular` (excluded from the headline). */
  monthlyEquivalent: number | null;
  dedupKeys: string[]; // the underlying marked transactions (unmark / drill)
}

export interface SubscriptionsSummary {
  subscriptions: SubscriptionRow[];
  monthlyTotal: number; // sum of monthlyEquivalent over confidently-inferred subscriptions
  annualTotal: number; // monthlyTotal × 12
}

// Cadence inference bands (median day-interval between consecutive charges).
// Tolerant — real billing dates drift by a few days.
const WEEKLY = { lo: 5, hi: 9 };
const MONTHLY = { lo: 26, hi: 35 };
const ANNUAL = { lo: 350, hi: 380 };
const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.333

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Whole days between two 'YYYY-MM-DD' dates (UTC, no TZ drift). */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round(Math.abs(db - da) / 86_400_000);
}

function cadenceFromInterval(days: number): Exclude<SubscriptionCadence, "pending"> {
  if (days >= WEEKLY.lo && days <= WEEKLY.hi) return "weekly";
  if (days >= MONTHLY.lo && days <= MONTHLY.hi) return "monthly";
  if (days >= ANNUAL.lo && days <= ANNUAL.hi) return "annual";
  return "irregular";
}

function monthlyEquivalent(cadence: SubscriptionCadence, typicalAmount: number): number | null {
  switch (cadence) {
    case "monthly":
      return round2(typicalAmount);
    case "weekly":
      return round2(typicalAmount * WEEKS_PER_MONTH);
    case "annual":
      return round2(typicalAmount / 12);
    default:
      return null; // pending / irregular — excluded from the normalized headline
  }
}

/**
 * Summarize the user's marked subscriptions. Groups by `normalizeMerchant` (so
 * "NETFLIX.COM" and "Netflix" merge); a group with <2 occurrences is `pending`
 * (shown, but excluded from the headline so the total never rests on a guess).
 */
export function summarizeSubscriptions(txns: readonly MarkedTxn[]): SubscriptionsSummary {
  // Group by normalized merchant; fall back to the description, then the dedup_key
  // (so a merchant-less charge is its own group, never collapsed into a "" bucket).
  const groups = new Map<string, MarkedTxn[]>();
  for (const t of txns) {
    const key = normalizeMerchant(t.merchant) || normalizeMerchant(t.description) || `dk:${t.dedupKey}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const subscriptions: SubscriptionRow[] = [];
  for (const [normKey, members] of groups) {
    const sorted = [...members].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const typicalAmount = round2(median(members.map((m) => m.amount)));
    let cadence: SubscriptionCadence = "pending";
    if (sorted.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) intervals.push(daysBetween(sorted[i - 1].occurredOn, sorted[i].occurredOn));
      cadence = cadenceFromInterval(median(intervals));
    }
    const latest = sorted[sorted.length - 1];
    subscriptions.push({
      merchant: latest.merchant ?? latest.description ?? "Subscription",
      normKey,
      typicalAmount,
      cadence,
      occurrences: members.length,
      monthlyEquivalent: monthlyEquivalent(cadence, typicalAmount),
      dedupKeys: members.map((m) => m.dedupKey),
    });
  }

  // Sort by monthly weight (confidently-inferred first, desc), then by typical amount.
  subscriptions.sort(
    (a, b) => (b.monthlyEquivalent ?? -1) - (a.monthlyEquivalent ?? -1) || b.typicalAmount - a.typicalAmount,
  );

  const monthlyTotal = round2(subscriptions.reduce((s, r) => s + (r.monthlyEquivalent ?? 0), 0));
  return { subscriptions, monthlyTotal, annualTotal: round2(monthlyTotal * 12) };
}

/**
 * WLT-24 (fast-follow seam) — the provider-agnostic subscription detector. NOT
 * implemented this slice; the detection story implements it (Plaid recurring
 * behind a swappable adapter, or a custom normalizeMerchant+cadence detector) and
 * auto-sets `transaction_flags(source='auto')` as a SIGNAL the user overrides.
 */
export interface CandidateSubscription {
  dedupKey: string;
  normKey: string;
  confidence: number; // 0..1
}
export interface SubscriptionDetector {
  detect(input: { txns: readonly MarkedTxn[] }): Promise<CandidateSubscription[]>;
}

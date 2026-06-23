// WLT-24-1 — the PURE subscriptions summary: given the user's marked recurring
// transactions, group them by normalized merchant and infer each subscription's
// typical amount + cadence, then a normalized monthly + annual headline total.
// No I/O — unit-testable against fixtures. The app layer reads the flagged txns
// (paginated) and hands them here; the compute never touches the category axis
// (orthogonality — a subscription is still real spend on the budget surfaces).

import { normalizeMerchant } from "./categories";

/**
 * WLT-24-1 (mark-the-merchant) — the stable key a subscription mark applies to.
 * Marking one charge marks the whole MERCHANT, so every charge from it (past +
 * future) is flagged. Entity-id first (Plaid's stable merchant id, robust to name
 * drift like "NETFLIX.COM #123"), else the normalized name. Null ⇒ unmatchable
 * (no merchant) — only the single charge is flagged. Mirrors the WLT-22-3/4
 * merchant-rule match key, applied to subscription flags instead of categories.
 */
export function subscriptionMerchantKey(merchant: string | null, merchantEntityId: string | null | undefined): string | null {
  if (merchantEntityId) return `e:${merchantEntityId}`;
  const norm = normalizeMerchant(merchant);
  return norm ? `n:${norm}` : null;
}

/** A transaction the user has marked as a subscription (the read passes these in).
 * `merchantEntityId` is optional — the WLT-24-1 summary path ignores it; the
 * WLT-24-2 detector uses it to group by the stable `subscriptionMerchantKey`. */
export interface MarkedTxn {
  dedupKey: string;
  merchant: string | null;
  merchantEntityId?: string | null;
  description: string;
  amount: number; // unsigned, in dollars
  occurredOn: string; // 'YYYY-MM-DD'
  source?: "user" | "auto"; // WLT-24-2 — how the flag arose; absent ⇒ treated as 'user'
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
  /** WLT-24-2 — 'auto' iff EVERY underlying flag was auto-detected; 'user' once the
   * user has marked any charge of the merchant (a user touch claims ownership). The
   * UI tags 'auto' rows "detected" so an auto-mark reads as intentional, not a bug. */
  source: "user" | "auto";
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

// ── WLT-24-3: price clustering — a vendor can bill MULTIPLE distinct subscriptions
// (Sony PlayStation → a $13.99 sub AND a $45 sub). A subscription is a (merchant,
// PRICE), not just a merchant — so within a merchant we split charges into PRICE
// clusters and treat each as its own series. Single-linkage over the sorted distinct
// amounts: a gap whose RATIO exceeds CLUSTER_MAX_RATIO starts a new cluster, so a
// single sub's price CREEP ($15.49→$16.99, +10%) stays together while genuinely
// distinct prices ($13.99 vs $45, 3.2×) split. The cluster is re-derived from amounts
// every read/detect run — never persisted; the flag stays per dedup_key (no schema).
// Limitation: two distinct subs at the SAME price from one vendor can't be split.

/** Adjacent sorted amounts whose ratio exceeds this start a new price cluster (>25%). */
export const CLUSTER_MAX_RATIO = 1.25;

/** The ascending cluster anchors (each cluster's minimum amount) for a set of amounts. */
function clusterAnchors(amounts: readonly number[]): number[] {
  const distinct = [...new Set(amounts)].sort((a, b) => a - b);
  const anchors: number[] = [];
  let prev = Number.NEGATIVE_INFINITY;
  for (const amt of distinct) {
    if (prev <= 0 || amt / prev > CLUSTER_MAX_RATIO) anchors.push(amt); // a > threshold jump → new cluster
    prev = amt;
  }
  return anchors;
}

/** The clusterId an amount belongs to = the highest anchor <= it. Stable + re-derived. */
function clusterIdForAmount(anchors: readonly number[], amount: number): string {
  let anchor = anchors[0] ?? amount;
  for (const a of anchors) {
    if (a <= amount) anchor = a;
    else break;
  }
  return `c:${anchor.toFixed(2)}`;
}

/** Split a merchant's charges into price clusters (clusterId → members). */
export function clusterByPrice(members: readonly MarkedTxn[]): Map<string, MarkedTxn[]> {
  const anchors = clusterAnchors(members.map((m) => m.amount));
  const clusters = new Map<string, MarkedTxn[]>();
  for (const m of members) {
    const id = clusterIdForAmount(anchors, m.amount);
    const g = clusters.get(id);
    if (g) g.push(m);
    else clusters.set(id, [m]);
  }
  return clusters;
}

/**
 * Summarize the user's marked subscriptions. Groups by `normalizeMerchant` (so
 * "NETFLIX.COM" and "Netflix" merge), then sub-groups each merchant by PRICE
 * cluster (WLT-24-3) so a vendor with two subscriptions shows two rows. A series
 * with <2 occurrences is `pending` (shown, but excluded from the headline so the
 * total never rests on a guess).
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
  for (const [normKey, merchantMembers] of groups) {
    // WLT-24-3 — split the merchant into price clusters; each cluster is its own
    // subscription row (so a two-sub vendor shows two rows, summed honestly).
    for (const [clusterId, members] of clusterByPrice(merchantMembers)) {
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
        normKey: `${normKey}|${clusterId}`, // composite — unique per (merchant, price series)
        typicalAmount,
        cadence,
        occurrences: members.length,
        monthlyEquivalent: monthlyEquivalent(cadence, typicalAmount),
        dedupKeys: members.map((m) => m.dedupKey),
        // 'auto' only when every charge in the series is auto-detected; any user mark ⇒ 'user'.
        source: members.every((m) => m.source === "auto") ? "auto" : "user",
      });
    }
  }

  // Sort by monthly weight (confidently-inferred first, desc), then by typical amount.
  subscriptions.sort(
    (a, b) => (b.monthlyEquivalent ?? -1) - (a.monthlyEquivalent ?? -1) || b.typicalAmount - a.typicalAmount,
  );

  const monthlyTotal = round2(subscriptions.reduce((s, r) => s + (r.monthlyEquivalent ?? 0), 0));
  return { subscriptions, monthlyTotal, annualTotal: round2(monthlyTotal * 12) };
}

// ── WLT-24-2: the custom subscription detector (pure) ───────────────────────
// Find a user's recurring charges from history so they can be auto-marked
// (`source='auto'`) — a SIGNAL the user overrides, never a verdict. HIGH-PRECISION,
// never alarming: a merchant becomes a candidate only if it clears THREE independent
// gates (enough occurrences AND a clean cadence AND a stable amount) and a
// confidence floor. We under-detect on purpose — a wrong auto-mark erodes trust
// more than a miss (the user can always mark by hand). Provider-agnostic: it reads
// the same normalized merchant/cadence the WLT-24-1 summary does, so no Plaid
// recurring product (and no ADR-002 amendment) is needed.

/** Detection thresholds — named so they're tunable and unit-tested at the edges. */
export const DETECT_MIN_OCCURRENCES = 3; // stricter than a human mark's >= 2
export const DETECT_MAX_AMOUNT_CV = 0.1; // amount coefficient-of-variation ceiling (<=10% spread)
export const DETECT_MIN_CONFIDENCE = 0.7; // auto-flag confidence floor
const AMOUNT_CV_DENOM = 0.1; // amountScore reaches 0 at this amount CV
const INTERVAL_CV_DENOM = 0.25; // regularityScore reaches 0 at this interval CV
const OCCURRENCE_SATURATION = 6; // occurrenceScore saturates at this many charges
const W_AMOUNT = 0.45;
const W_REGULARITY = 0.35;
const W_OCCURRENCE = 0.2;

function mean(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Population coefficient of variation (stddev / mean). 0 for <2 points; a
 * zero/negative mean is treated as maximally unstable (not a stable price). */
function coefficientOfVariation(nums: readonly number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  if (m <= 0) return Number.POSITIVE_INFINITY;
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variance) / m;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** A merchant the detector believes is a subscription — its charges get flagged
 * `source='auto'`. `merchantKey` is the fan-out + skip key (already-flagged /
 * dismissed merchants are filtered on it); `dedupKeys` are the charges to flag. */
export interface CandidateSubscription {
  merchantKey: string; // subscriptionMerchantKey (entity-id-first)
  clusterId: string; // WLT-24-3 — the price cluster within the merchant
  compositeKey: string; // `${merchantKey}|${clusterId}` — the per-SERIES skip/dismiss key
  normKey: string; // the grouping/display key (= compositeKey)
  dedupKeys: string[]; // the SERIES' charges seen in the input (to flag)
  cadence: Exclude<SubscriptionCadence, "pending" | "irregular">;
  occurrences: number;
  typicalAmount: number; // median of the series' charges
  confidence: number; // 0..1
}

/**
 * Detect a user's recurring-subscription merchants from their active debits (pure;
 * no I/O). Groups by `subscriptionMerchantKey`, then keeps only merchants that pass
 * all gates with `confidence >= DETECT_MIN_CONFIDENCE`. The write path flags each
 * candidate's `dedupKeys` with `source='auto'`, skipping already-flagged/dismissed
 * merchants. Confidence blends amount stability, interval regularity, and how many
 * times we've seen the charge — so a long, rock-steady history scores highest.
 */
export function detectSubscriptions(input: { txns: readonly MarkedTxn[] }): CandidateSubscription[] {
  const groups = new Map<string, MarkedTxn[]>();
  for (const t of input.txns) {
    const key = subscriptionMerchantKey(t.merchant, t.merchantEntityId);
    if (!key) continue; // unmatchable merchant — never auto-detect a one-off
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const candidates: CandidateSubscription[] = [];
  for (const [merchantKey, merchantMembers] of groups) {
    // WLT-24-3 — evaluate each PRICE cluster as its own series, so a vendor with two
    // subscriptions yields two candidates (and two interleaved subs no longer blend
    // into one `irregular` group that the cadence gate would drop).
    for (const [clusterId, members] of clusterByPrice(merchantMembers)) {
      // Gate (a) — enough occurrences.
      if (members.length < DETECT_MIN_OCCURRENCES) continue;

      const sorted = [...members].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) intervals.push(daysBetween(sorted[i - 1].occurredOn, sorted[i].occurredOn));

      // Gate (b) — a clean (non-irregular) cadence.
      const cadence = cadenceFromInterval(median(intervals));
      if (cadence === "irregular") continue;

      // Gate (c) — a stable amount (fixed-price subscriptions vary little). Also
      // rejects a variable-spend merchant whose amounts single-linkage-chained into
      // one wide cluster (high CV) — clustering only sub-divides, never invents subs.
      const amounts = members.map((m) => m.amount);
      const amountCV = coefficientOfVariation(amounts);
      if (amountCV > DETECT_MAX_AMOUNT_CV) continue;

      // Confidence — the margin tie-breaker once the hard gates pass.
      const amountScore = clamp01(1 - amountCV / AMOUNT_CV_DENOM);
      const regularityScore = clamp01(1 - coefficientOfVariation(intervals) / INTERVAL_CV_DENOM);
      const occurrenceScore = Math.min(members.length, OCCURRENCE_SATURATION) / OCCURRENCE_SATURATION;
      const confidence = round2(W_AMOUNT * amountScore + W_REGULARITY * regularityScore + W_OCCURRENCE * occurrenceScore);
      if (confidence < DETECT_MIN_CONFIDENCE) continue;

      const compositeKey = `${merchantKey}|${clusterId}`;
      candidates.push({
        merchantKey,
        clusterId,
        compositeKey,
        normKey: compositeKey,
        dedupKeys: members.map((m) => m.dedupKey),
        cadence,
        occurrences: members.length,
        typicalAmount: round2(median(amounts)),
        confidence,
      });
    }
  }
  // Most-confident first (deterministic; the write path flags them all anyway).
  candidates.sort((a, b) => b.confidence - a.confidence || a.compositeKey.localeCompare(b.compositeKey));
  return candidates;
}

/**
 * The fast-follow seam (WLT-24 architecture), now filled by the custom detector.
 * Kept as an interface + a concrete impl so a future Plaid-recurring adapter can
 * swap in behind the same shape without touching the write path.
 */
export interface SubscriptionDetector {
  detect(input: { txns: readonly MarkedTxn[] }): Promise<CandidateSubscription[]>;
}

export const customSubscriptionDetector: SubscriptionDetector = {
  detect: async (input) => detectSubscriptions(input),
};

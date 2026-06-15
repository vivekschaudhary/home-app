// Recap domain logic (WLT-15 / WLT-16) — the "since last time" computations,
// PURE over inputs (snapshots + current net worth + target). No DB, no I/O →
// fully unit-testable. The app layer (app/lib/recap.ts) reads the rows and the
// surface (RecapCard) renders the result. Mirrors the workflow.ts seam: logic
// here, persistence there.
//
// Three signals this slice: net-worth MOVEMENT (since last time), PROGRESS
// toward the declared target, and ONE state-ranked prompted action. Spending +
// anomalies are later WLT-15 stories — deliberately absent here.

import { suggestTarget } from "./workflow";

/** A daily net-worth sample (net_worth_snapshots row; amounts only, no PII). */
export interface NetWorthSnapshot {
  capturedOn: string; // 'YYYY-MM-DD'
  netWorth: number;
}

/** Movement since last time — direction in WORDS (never color-only), plus delta. */
export interface Movement {
  direction: "up" | "down" | "flat";
  /** Absolute change in net worth (>= 0); 0 when flat. */
  delta: number;
}

export type ProgressStatus = "ahead" | "on_track" | "behind";

/** Progress toward the declared target. `percent` may exceed 100 (ahead). */
export interface TargetProgress {
  current: number;
  target: number;
  percent: number;
  status: ProgressStatus;
}

/**
 * The ONE prompted action (design: at most one, state-ranked, honest). Both
 * types open the REAL target step — never a vanity tap. `suggestedTarget` seeds
 * the input. The completed action writes a repeatable WorkflowRun (the WAWU unit).
 */
export interface PromptedAction {
  type: "adjust_target" | "raise_target";
  /** The WorkflowRun.kind it records (recap_* → weekly-repeatable, period-scoped). */
  kind: "recap_adjust_target" | "recap_raise_target";
  suggestedTarget: number;
}

export interface RecapSignals {
  /** Movement, or null at cold-start (< 2 snapshots) — never a fabricated number. */
  movement: Movement | null;
  /** Progress toward target, or null when no target is set yet. */
  progress: TargetProgress | null;
}

// ── Spending (WLT-17): "where your money went" — a DISPLAY signal, no action ──

/** A transaction for the spending comparison (amounts/enums only — no PII). */
export interface SpendingTxn {
  /** 'debit' (spend) | 'credit'. Only debits count toward spend. */
  direction: string;
  /** Plaid primary category (raw); null → "Other" after humanizing. */
  category: string | null;
  /** Positive amount of the transaction. */
  amount: number;
  /** 'YYYY-MM-DD' (provider posted date). */
  occurredOn: string;
}

/** A humanized category + its summed spend this week. */
export interface CategorySpend {
  category: string; // already humanized for display
  amount: number;
}

export interface SpendingComparison {
  /** Total debits in the last 7 days. */
  thisWeek: number;
  /**
   * Whether a week-over-week comparison is honest. False at first-week (no
   * activity in the prior-week window → we won't fabricate a delta).
   */
  comparable: boolean;
  /** vs the prior week's debits; null when !comparable. Direction in WORDS. */
  delta: { direction: "more" | "less" | "same"; amount: number } | null;
  /** The top (up to 3) spending categories this week, humanized, desc. */
  topCategories: CategorySpend[];
}

const DAY_MS = 86_400_000;

/** Title-case a Plaid primary category for display; null/empty → "Other". */
export function humanizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Other";
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Spending this week vs last, from REAL transactions. Windows (relative to
 * `asOf`, a 'YYYY-MM-DD' day): this-week = (asOf-7d, asOf]; prior-week =
 * (asOf-14d, asOf-7d]. Debits only.
 *
 * Honesty rules (AC1/AC3):
 *   - Returns null when there are NO debits this week → the section is omitted
 *     (never a "$0 spent" pseudo-insight).
 *   - `comparable` is true only when the prior-week window had activity (any
 *     transaction) — so a genuinely-quiet prior week reads as a real comparison,
 *     but a brand-new connection with no prior-week data shows this-week-only
 *     (no fabricated delta).
 */
export function computeSpendingComparison(
  txns: readonly SpendingTxn[],
  asOf: string,
): SpendingComparison | null {
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(asOfMs)) return null;
  const sevenDaysAgoMs = asOfMs - 7 * DAY_MS;
  const fourteenDaysAgoMs = asOfMs - 14 * DAY_MS;

  let thisWeekSpend = 0;
  let priorWeekSpend = 0;
  let priorWeekHadActivity = false;
  const byCategory = new Map<string, number>();

  for (const t of txns) {
    const tMs = Date.parse(`${t.occurredOn}T00:00:00Z`);
    if (Number.isNaN(tMs)) continue;
    const inThisWeek = tMs > sevenDaysAgoMs && tMs <= asOfMs;
    const inPriorWeek = tMs > fourteenDaysAgoMs && tMs <= sevenDaysAgoMs;
    if (inPriorWeek) priorWeekHadActivity = true; // any direction = the account was active then
    if (t.direction !== "debit") continue;
    if (inThisWeek) {
      thisWeekSpend = round2(thisWeekSpend + t.amount);
      const cat = humanizeCategory(t.category);
      byCategory.set(cat, round2((byCategory.get(cat) ?? 0) + t.amount));
    } else if (inPriorWeek) {
      priorWeekSpend = round2(priorWeekSpend + t.amount);
    }
  }

  if (thisWeekSpend === 0) return null; // nothing spent → omit the section

  const topCategories = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  if (!priorWeekHadActivity) {
    return { thisWeek: thisWeekSpend, comparable: false, delta: null, topCategories };
  }
  const diff = round2(thisWeekSpend - priorWeekSpend);
  const delta =
    diff === 0
      ? ({ direction: "same", amount: 0 } as const)
      : diff > 0
        ? ({ direction: "more", amount: diff } as const)
        : ({ direction: "less", amount: Math.abs(diff) } as const);
  return { thisWeek: thisWeekSpend, comparable: true, delta, topCategories };
}

/**
 * Net-worth movement from the daily samples. Needs ≥ 2 snapshots — returns null
 * at cold-start (the honest "we're still watching" state; AC2). Compares the
 * latest sample to the most recent one that is STRICTLY OLDER (the prior day's
 * close), so a same-day re-sample never reads as "no movement".
 *
 * `snapshots` may be in any order; we sort by capturedOn descending.
 */
export function computeNetWorthMovement(snapshots: readonly NetWorthSnapshot[]): Movement | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => (a.capturedOn < b.capturedOn ? 1 : a.capturedOn > b.capturedOn ? -1 : 0));
  const latest = sorted[0];
  const prior = sorted.find((s) => s.capturedOn < latest.capturedOn);
  if (!prior) return null; // all samples share one date → no prior period yet
  const change = round2(latest.netWorth - prior.netWorth);
  if (change === 0) return { direction: "flat", delta: 0 };
  return { direction: change > 0 ? "up" : "down", delta: Math.abs(change) };
}

/**
 * Progress toward the declared target. `percent` = current / target (rounded) —
 * reads naturally as "you have {current} of your {target} target". May exceed
 * 100 when ahead. Status (the conservative v1 rule — pace/threshold tuning is an
 * Engineer escalation per the bet architecture, I2):
 *   - `ahead`    when current >= target (you've reached it),
 *   - `behind`   when the unmet target's net worth FELL since last time
 *                (a real, defensible signal — no invented pace math),
 *   - `on_track` otherwise (flat or rising toward an unmet target).
 *
 * Returns null when no target is set (recap shows nothing actionable then).
 */
export function computeTargetProgress(
  currentNetWorth: number,
  target: number | null | undefined,
  movement: Movement | null,
): TargetProgress | null {
  if (typeof target !== "number" || !Number.isFinite(target) || target === 0) return null;
  const current = round2(currentNetWorth);
  // Guard against a divide that flips sign on a negative target (targets are
  // forward, positive amounts in practice, but stay honest if not).
  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  let status: ProgressStatus;
  if (current >= target) status = "ahead";
  else if (movement?.direction === "down") status = "behind";
  else status = "on_track";
  return { current, target, percent, status };
}

/**
 * The single state-ranked action (AC4). Driven by target PROGRESS (available
 * whenever a target is set — even at movement cold-start), so the recap always
 * offers exactly one honest forward move when there's a target:
 *   - `behind`           → adjust your target (review/reset on real data),
 *   - `on_track`/`ahead` → aim higher (raise the target — a real choice).
 * Returns null when there's no target (WorkflowCard onboarding owns that case).
 */
export function selectPromptedAction(progress: TargetProgress | null): PromptedAction | null {
  if (!progress) return null;
  if (progress.status === "behind") {
    // Suggest a still-encouraging target near current (don't pile on when behind).
    return { type: "adjust_target", kind: "recap_adjust_target", suggestedTarget: suggestTarget(progress.current) };
  }
  // on_track | ahead → raise the bar.
  return { type: "raise_target", kind: "recap_raise_target", suggestedTarget: suggestTarget(progress.current) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

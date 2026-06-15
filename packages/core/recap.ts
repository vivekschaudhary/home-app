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

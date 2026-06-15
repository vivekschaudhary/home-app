// WLT-16 — the recap's reads + the repeatable action commit, wired to Supabase.
// The COMPUTATIONS are pure in @wealth/core (recap.ts); this file reads the rows
// (owner-scoped, under the user's RLS session) and assembles the view. The
// dashboard RSC calls getRecap on every load → reconcile-on-load, never stale
// props (the #36 / [real-path-integration-coverage] lesson). Persistence (the
// action) happens in the route handler path, never in RSC render.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import {
  AUDIT_ACTIONS,
  FUNNEL_EVENTS,
  type Movement,
  type NetWorthSnapshot,
  type PromptedAction,
  type TargetProgress,
  computeNetWorthMovement,
  computeTargetProgress,
  personalizeNetWorth,
  selectPromptedAction,
} from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";
import { readAccountBalances } from "./aggregation-read";

export type RecapView =
  | { visible: false }
  | {
      visible: true;
      workflowId: string;
      netWorth: number;
      movement: Movement | null; // null = cold-start (< 2 snapshots)
      progress: TargetProgress; // target is set (else not visible)
      action: PromptedAction | null;
    };

/** ISO-8601 week key, e.g. '2026-W24' — the recap action's weekly idempotency scope. */
export function isoWeek(d: Date = new Date()): string {
  // Copy to UTC midnight, shift to the Thursday of this week (ISO weeks pivot on Thu).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Sun=0 → 7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const RECAP_KINDS = new Set(["recap_adjust_target", "recap_raise_target"]);

/**
 * Assemble the "since last time" recap. Visible only for the dead-end population
 * — a user with a RUNNING workflow (a target set). Reads live (current net worth
 * from balances; movement from the daily snapshots) → never stale. Emits
 * recap_viewed (a returning visit; the Day-7 return signal) when shown.
 */
export async function getRecap(userId: string): Promise<RecapView> {
  const supabase = await createServerSupabase();

  // The running net-worth workflow (active + a target in config). Owner-scoped.
  const { data: wfRows } = await supabase
    .from("workflows")
    .select("id, config")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const wf = wfRows?.[0] as { id: string; config: Record<string, unknown> } | undefined;
  const target = wf?.config?.target;
  if (!wf || typeof target !== "number") return { visible: false };

  // Current net worth — LIVE from balances (freshest). Hide rather than show a
  // hollow recap if balances have gone missing (defer to WorkflowCard's repair).
  const liveConfig = personalizeNetWorth(await readAccountBalances(userId));
  if (!liveConfig) return { visible: false };

  // Movement — from the daily snapshot series (owner-SELECT). < 2 → cold-start.
  const { data: snapRows } = await supabase
    .from("net_worth_snapshots")
    .select("captured_on, net_worth")
    .eq("user_id", userId)
    .order("captured_on", { ascending: false })
    .limit(30);
  const snapshots: NetWorthSnapshot[] = (snapRows ?? []).map((r) => {
    const row = r as { captured_on: string; net_worth: number | string };
    return { capturedOn: row.captured_on, netWorth: Number(row.net_worth) };
  });

  const movement = computeNetWorthMovement(snapshots);
  const progress = computeTargetProgress(liveConfig.netWorth, target, movement);
  if (!progress) return { visible: false };
  const action = selectPromptedAction(progress);

  // A returning visit — the Day-7 return signal. Service-role emit (same pattern
  // as workflow_assembled in the engine); distinct-user-per-week metric is
  // robust to multiple emits within a request/week.
  await emitFunnel(FUNNEL_EVENTS.RECAP_VIEWED, userId, {});
  if (action) {
    await emitFunnel(FUNNEL_EVENTS.RECAP_ACTION_PROMPTED, userId, { action_type: action.type });
  }

  return { visible: true, workflowId: wf.id, netWorth: liveConfig.netWorth, movement, progress, action };
}

export type RecapActionResult =
  | { ok: true; target: number; noop: boolean }
  | { ok: false; error: "invalid" | "save_failed" };

/**
 * The recap's one platform-prompted action — a REPEATABLE WorkflowRun (the WAWU
 * unit), weekly-idempotent. Atomic at the DB (complete_recap_action, SECURITY
 * INVOKER → owner RLS): run-insert + config.target update commit together. A
 * second submit in the same ISO week is an idempotent no-op (ok, noop:true).
 * Emits action_completed only on a genuinely new run (so WAWU isn't double-fed
 * within a week).
 */
export async function completeRecapAction(input: {
  userId: string;
  workflowId: string;
  target: number;
  kind: string;
}): Promise<RecapActionResult> {
  if (!Number.isFinite(input.target) || input.target === 0) return { ok: false, error: "invalid" };
  if (!RECAP_KINDS.has(input.kind)) return { ok: false, error: "invalid" }; // whitelist the recap kinds
  const target = Math.round(input.target * 100) / 100;
  const period = isoWeek();

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("complete_recap_action", {
    p_workflow_id: input.workflowId,
    p_target: target,
    p_kind: input.kind,
    p_period: period,
  });
  if (error) return { ok: false, error: "save_failed" };
  const res = data as { ok: boolean; noop?: boolean; archetype?: string; goal_kind?: string } | null;
  if (!res?.ok) return { ok: false, error: "invalid" };

  if (!res.noop) {
    await emitFunnel(FUNNEL_EVENTS.ACTION_COMPLETED, input.userId, {
      archetype: res.archetype ?? "",
      goal_kind: res.goal_kind ?? "", // SAME contract shape as the onboarding action
      source: "recap",
    });
    await emitAudit(AUDIT_ACTIONS.WORKFLOW_ACTION, input.userId, {
      workflow_id: input.workflowId,
      archetype: res.archetype ?? "",
      action_kind: input.kind,
    });
  }
  return { ok: true, target, noop: Boolean(res.noop) };
}

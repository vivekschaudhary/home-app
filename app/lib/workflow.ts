// WLT-12 — workflow engine orchestration (server). Two-phase assembly per the
// bet architecture: (1) archetype selection from the declared Goal.kind — no
// data needed (intent-first: declare precedes connect); (2) personalization
// from REAL balances once synced → status 'active' + the one action. Completing
// the action records an immutable WorkflowRun (the WAWU unit). All writes run
// under the user's RLS session (owner-CRUD); idempotency via the partial unique
// index (one live workflow per goal).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import {
  FUNNEL_EVENTS,
  type NetWorthConfig,
  archetypeForGoalKind,
  personalizeNetWorth,
} from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readAccountBalances } from "./aggregation-read";

export type WorkflowView =
  | { state: "none" } // no goal, or goalKind not yet mapped (WLT-11 placeholder stays)
  | { state: "pending_data"; workflowId: string } // assembled; awaiting real data (connect bridge)
  | { state: "active"; workflowId: string; config: NetWorthConfig } // personalized; action available
  | { state: "running"; workflowId: string; config: NetWorthConfig; target: number }; // action completed

type WorkflowRow = {
  id: string;
  goal_id: string;
  archetype: string;
  status: string;
  config: Record<string, unknown>;
};

/**
 * The dashboard's engine entry point — idempotent get-or-assemble-or-advance.
 * Lazy assembly on load (Engineer's call per architecture open question): no
 * declare-path change, and the partial unique index makes racing loads safe.
 */
export async function getOrCreateWorkflow(userId: string): Promise<WorkflowView> {
  const supabase = await createServerSupabase();

  // The user's most recent live goal (WLT-11 writes exactly one per declare).
  const { data: goalRows } = await supabase
    .from("goals")
    .select("id, kind, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["pending_workflow", "active"])
    .order("created_at", { ascending: false })
    .limit(1);
  const goal = (goalRows?.[0] ?? null) as { id: string; kind: string; status: string } | null;
  if (!goal) return { state: "none" };

  // Phase-1 selection: only mapped kinds enter the engine (AC12 — the other
  // kinds keep the WLT-11 placeholder until their archetype story lands).
  const archetype = archetypeForGoalKind(goal.kind);
  if (!archetype) return { state: "none" };

  // Existing live workflow for this goal?
  const { data: wfRows } = await supabase
    .from("workflows")
    .select("id, goal_id, archetype, status, config")
    .eq("user_id", userId)
    .eq("goal_id", goal.id)
    .neq("status", "archived")
    .is("deleted_at", null)
    .limit(1);
  let wf = (wfRows?.[0] ?? null) as WorkflowRow | null;

  if (!wf) {
    const { data: created, error } = await supabase
      .from("workflows")
      .insert({ user_id: userId, goal_id: goal.id, archetype: archetype.key })
      .select("id, goal_id, archetype, status, config")
      .single();
    if (error) {
      // Unique-index race (two loads assembling at once): re-read the winner.
      const { data: again } = await supabase
        .from("workflows")
        .select("id, goal_id, archetype, status, config")
        .eq("user_id", userId)
        .eq("goal_id", goal.id)
        .neq("status", "archived")
        .is("deleted_at", null)
        .limit(1);
      wf = (again?.[0] ?? null) as WorkflowRow | null;
      if (!wf) return { state: "none" };
    } else {
      wf = created as WorkflowRow;
    }
  }

  // Phase-2 personalization: pending_data → active once real balances exist.
  if (wf.status === "pending_data") {
    const balances = await readAccountBalances(userId);
    const config = personalizeNetWorth(balances);
    if (!config) return { state: "pending_data", workflowId: wf.id }; // no real data yet — never fake (AC4)

    const { error: upErr } = await supabase
      .from("workflows")
      .update({ config, status: "active" })
      .eq("id", wf.id)
      .eq("status", "pending_data"); // advance once; lost race is harmless
    if (upErr) return { state: "pending_data", workflowId: wf.id };

    // The WLT-3→WLT-4 handoff: the goal is now being worked.
    await supabase.from("goals").update({ status: "active" }).eq("id", goal.id).eq("status", "pending_workflow");
    await emitFunnel(FUNNEL_EVENTS.WORKFLOW_ASSEMBLED, userId, {
      archetype: archetype.key,
      goal_kind: goal.kind, // enumerable; no PII, no free-text
    });
    wf = { ...wf, status: "active", config: config as unknown as Record<string, unknown> };
  }

  const config = wf.config as unknown as NetWorthConfig & { target?: number };
  if (typeof config?.target === "number") {
    return { state: "running", workflowId: wf.id, config, target: config.target };
  }
  return { state: "active", workflowId: wf.id, config };
}

export type ActionResult = { ok: true; target: number } | { ok: false; error: "invalid" | "save_failed" };

/**
 * Complete the one platform-prompted action: set the net-worth target.
 * Writes the immutable WorkflowRun (the WAWU unit) + persists the target.
 */
export async function completeAction(input: {
  userId: string;
  workflowId: string;
  target: number;
}): Promise<ActionResult> {
  if (!Number.isFinite(input.target)) return { ok: false, error: "invalid" };
  const target = Math.round(input.target * 100) / 100;

  const supabase = await createServerSupabase();
  const { data: wfRows } = await supabase
    .from("workflows")
    .select("id, archetype, status, config")
    .eq("id", input.workflowId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);
  const wf = (wfRows?.[0] ?? null) as WorkflowRow | null;
  if (!wf) return { ok: false, error: "invalid" };

  // The action record first (immutable, owner-insert) — the WAWU unit.
  const { error: runErr } = await supabase.from("workflow_runs").insert({
    user_id: input.userId,
    workflow_id: wf.id,
    kind: "target_set",
    context: { target }, // amount only — no PII
  });
  if (runErr) return { ok: false, error: "save_failed" };

  const { error: cfgErr } = await supabase
    .from("workflows")
    .update({ config: { ...wf.config, target } })
    .eq("id", wf.id);
  if (cfgErr) return { ok: false, error: "save_failed" };

  await emitFunnel(FUNNEL_EVENTS.ACTION_COMPLETED, input.userId, {
    archetype: wf.archetype,
    action_kind: "target_set", // enumerable; no PII
  });
  return { ok: true, target };
}

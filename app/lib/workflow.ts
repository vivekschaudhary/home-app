// WLT-12 — the engine wired to Supabase. The orchestration LOGIC lives in
// workflow-engine.ts (pure, unit-tested with a fake store); this file is the
// thin store implementation. All queries run under the user's RLS session
// (createServerSupabase, owner-CRUD) — no service-role on this path.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import type { NetWorthConfig } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readAccountBalances } from "./aggregation-read";
import {
  type ActionResult,
  type EngineStore,
  type GoalRow,
  type WorkflowRow,
  type WorkflowView,
  createWorkflowEngine,
} from "./workflow-engine";

export type { WorkflowView, ActionResult };

const WF_COLS = "id, goal_id, archetype, status, config";

const store: EngineStore = {
  async latestLiveGoal(userId): Promise<GoalRow | null> {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("goals")
      .select("id, kind, status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["pending_workflow", "active"])
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0] ?? null) as GoalRow | null;
  },

  async liveWorkflowForGoal(userId, goalId): Promise<WorkflowRow | null> {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("workflows")
      .select(WF_COLS)
      .eq("user_id", userId)
      .eq("goal_id", goalId)
      .neq("status", "archived")
      .is("deleted_at", null)
      .limit(1);
    return (data?.[0] ?? null) as WorkflowRow | null;
  },

  async insertWorkflow(userId, goalId, archetype) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("workflows")
      .insert({ user_id: userId, goal_id: goalId, archetype })
      .select(WF_COLS)
      .single();
    if (error) return "conflict"; // unique-index race — engine re-reads the winner
    return data as WorkflowRow;
  },

  async activateWorkflow(workflowId, config: NetWorthConfig) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("workflows")
      .update({ config, status: "active" })
      .eq("id", workflowId)
      .eq("status", "pending_data") // advance exactly once
      .select("id");
    return !error && (data?.length ?? 0) > 0;
  },

  async activateGoal(goalId) {
    const supabase = await createServerSupabase();
    await supabase.from("goals").update({ status: "active" }).eq("id", goalId).eq("status", "pending_workflow");
  },

  async activeWorkflowOwned(userId, workflowId) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("workflows")
      .select(`${WF_COLS}, goals!inner(kind)`)
      .eq("id", workflowId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);
    const row = (data?.[0] ?? null) as (WorkflowRow & { goals: { kind: string } }) | null;
    if (!row) return null;
    const { goals, ...wf } = row;
    return { ...wf, goalKind: goals.kind };
  },

  async insertRun(userId, workflowId, kind, context) {
    const supabase = await createServerSupabase();
    const { error } = await supabase
      .from("workflow_runs")
      .insert({ user_id: userId, workflow_id: workflowId, kind, context });
    if (!error) return "ok";
    // 23505 = unique_violation on (workflow_id, kind) — a replayed action.
    return error.code === "23505" ? "duplicate" : "error";
  },

  async saveConfig(workflowId, config) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("workflows").update({ config }).eq("id", workflowId);
    return !error;
  },
};

const engine = createWorkflowEngine({ store, readBalances: readAccountBalances, emit: emitFunnel });

export const getOrCreateWorkflow = engine.getOrCreateWorkflow;
export const completeAction = engine.completeAction;

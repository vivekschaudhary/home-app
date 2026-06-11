// WLT-12 — the workflow engine's orchestration logic, PURE over an injectable
// store (same seam discipline as @wealth/aggregation: logic never touches the
// vendor client directly → unit-testable with a fake store; supabase impl lives
// in app/lib/workflow.ts). Two-phase assembly per the bet architecture:
//   select (declare-time, no data) → personalize (post-sync, real balances) →
//   one action → ONE immutable WorkflowRun (the WAWU unit; replay-guarded).

import {
  type AccountBalance,
  FUNNEL_EVENTS,
  type FunnelEvent,
  type NetWorthConfig,
  archetypeForGoalKind,
  personalizeNetWorth,
} from "@wealth/core";

export interface GoalRow {
  id: string;
  kind: string;
  status: string;
}

export interface WorkflowRow {
  id: string;
  goal_id: string;
  archetype: string;
  status: string;
  config: Record<string, unknown>;
}

/** Narrow persistence seam — supabase impl in workflow.ts; fakes in tests. */
export interface EngineStore {
  latestLiveGoal(userId: string): Promise<GoalRow | null>;
  liveWorkflowForGoal(userId: string, goalId: string): Promise<WorkflowRow | null>;
  /** Insert pending_data workflow; "conflict" = lost the unique-index race. */
  insertWorkflow(userId: string, goalId: string, archetype: string): Promise<WorkflowRow | "conflict">;
  /** status pending_data→active + config; false = lost the advance race. */
  activateWorkflow(workflowId: string, config: NetWorthConfig): Promise<boolean>;
  /** The WLT-3→WLT-4 handoff: goal pending_workflow→active. */
  activateGoal(goalId: string): Promise<void>;
  /** The user's own ACTIVE workflow + its goal kind (for the funnel contract). */
  activeWorkflowOwned(userId: string, workflowId: string): Promise<(WorkflowRow & { goalKind: string }) | null>;
  /** Immutable run insert; "duplicate" = replay (unique workflow_id+kind). */
  insertRun(
    userId: string,
    workflowId: string,
    kind: string,
    context: Record<string, unknown>,
  ): Promise<"ok" | "duplicate" | "error">;
  saveConfig(workflowId: string, config: Record<string, unknown>): Promise<boolean>;
}

export type EmitFn = (event: FunnelEvent, userId: string, payload: Record<string, unknown>) => Promise<void>;

export type WorkflowView =
  | { state: "none" }
  | { state: "pending_data"; workflowId: string }
  | { state: "active"; workflowId: string; config: NetWorthConfig }
  | { state: "running"; workflowId: string; config: NetWorthConfig; target: number };

export type ActionResult = { ok: true; target: number } | { ok: false; error: "invalid" | "save_failed" };

export interface EngineDeps {
  store: EngineStore;
  readBalances: (userId: string) => Promise<AccountBalance[]>;
  emit: EmitFn;
}

export function createWorkflowEngine({ store, readBalances, emit }: EngineDeps) {
  /** Idempotent get-or-assemble-or-advance (lazy, on dashboard load). */
  async function getOrCreateWorkflow(userId: string): Promise<WorkflowView> {
    const goal = await store.latestLiveGoal(userId);
    if (!goal) return { state: "none" };

    // Only mapped kinds enter the engine (AC12 — others keep the WLT-11 placeholder).
    const archetype = archetypeForGoalKind(goal.kind);
    if (!archetype) return { state: "none" };

    let wf = await store.liveWorkflowForGoal(userId, goal.id);
    if (!wf) {
      const created = await store.insertWorkflow(userId, goal.id, archetype.key);
      // Unique-index race (two loads assembling at once): re-read the winner.
      wf = created === "conflict" ? await store.liveWorkflowForGoal(userId, goal.id) : created;
      if (!wf) return { state: "none" };
    }

    // Phase 2: personalize once real balances exist — never a fake figure (AC4).
    if (wf.status === "pending_data") {
      const config = personalizeNetWorth(await readBalances(userId));
      if (!config) return { state: "pending_data", workflowId: wf.id };

      const advanced = await store.activateWorkflow(wf.id, config);
      if (!advanced) return { state: "pending_data", workflowId: wf.id }; // lost race — next load resolves

      await store.activateGoal(goal.id);
      await emit(FUNNEL_EVENTS.WORKFLOW_ASSEMBLED, userId, {
        archetype: archetype.key,
        goal_kind: goal.kind, // the WLT-5 funnel contract — enumerable, no PII
      });
      wf = { ...wf, status: "active", config: config as unknown as Record<string, unknown> };
    }

    const config = wf.config as unknown as NetWorthConfig & { target?: number };
    if (typeof config?.target === "number") {
      return { state: "running", workflowId: wf.id, config, target: config.target };
    }
    return { state: "active", workflowId: wf.id, config };
  }

  /** The one platform-prompted action — exactly-once (replay-guarded). */
  async function completeAction(input: { userId: string; workflowId: string; target: number }): Promise<ActionResult> {
    if (!Number.isFinite(input.target)) return { ok: false, error: "invalid" };
    const target = Math.round(input.target * 100) / 100;

    const wf = await store.activeWorkflowOwned(input.userId, input.workflowId);
    if (!wf) return { ok: false, error: "invalid" };
    // Replay guard (engine layer): the action already completed → reject, no re-emit.
    if (typeof (wf.config as { target?: unknown }).target === "number") return { ok: false, error: "invalid" };

    // The immutable run first — the DB unique (workflow_id, kind) is the
    // defense-in-depth replay guard; a duplicate NEVER emits or re-writes.
    const run = await store.insertRun(input.userId, wf.id, "target_set", { target });
    if (run === "duplicate") return { ok: false, error: "invalid" };
    if (run === "error") return { ok: false, error: "save_failed" };

    const saved = await store.saveConfig(wf.id, { ...wf.config, target });
    if (!saved) return { ok: false, error: "save_failed" };

    await emit(FUNNEL_EVENTS.ACTION_COMPLETED, input.userId, {
      archetype: wf.archetype,
      goal_kind: wf.goalKind, // SAME contract shape as workflow_assembled (AC8)
    });
    return { ok: true, target };
  }

  return { getOrCreateWorkflow, completeAction };
}

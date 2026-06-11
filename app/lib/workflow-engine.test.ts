import { describe, expect, it, vi } from "vitest";
import type { AccountBalance } from "@wealth/core";
import {
  type EngineStore,
  type GoalRow,
  type WorkflowRow,
  createWorkflowEngine,
} from "./workflow-engine";

// ── fake store (in-memory) ──────────────────────────────────────────────────
function makeFakes(opts?: {
  goal?: GoalRow | null;
  balances?: AccountBalance[];
  insertConflict?: boolean;
  activateFails?: boolean;
  atomicResult?: "invalid" | "error"; // default: succeed atomically
  existingWorkflow?: WorkflowRow | null;
}) {
  const goal = opts?.goal === undefined ? { id: "g1", kind: "unified_view", status: "pending_workflow" } : opts.goal;
  let workflow: WorkflowRow | null = opts?.existingWorkflow ?? null;
  const emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const audited: Array<{ action: string; context: Record<string, unknown> }> = [];

  const store: EngineStore = {
    latestLiveGoal: vi.fn(async () => goal),
    liveWorkflowForGoal: vi.fn(async () => workflow),
    insertWorkflow: vi.fn(async (_u, goalId, archetype) => {
      if (opts?.insertConflict) {
        // the racing winner that the re-read should find
        workflow = { id: "wf-winner", goal_id: goalId, archetype, status: "pending_data", config: {} };
        return "conflict" as const;
      }
      workflow = { id: "wf1", goal_id: goalId, archetype, status: "pending_data", config: {} };
      return workflow;
    }),
    activateWorkflow: vi.fn(async (_id, config) => {
      if (opts?.activateFails) return false;
      workflow = workflow ? { ...workflow, status: "active", config: config as unknown as Record<string, unknown> } : null;
      return true;
    }),
    activateGoal: vi.fn(async () => {}),
    // Mirrors complete_workflow_action's semantics: invalid when not the
    // caller's active workflow OR the target's already set (replay/duplicate);
    // otherwise commits run + config together (atomic — all or nothing).
    completeActionAtomic: vi.fn(async (_u, workflowId, target) => {
      if (opts?.atomicResult) return opts.atomicResult;
      if (!workflow || workflow.id !== workflowId || workflow.status !== "active") return "invalid" as const;
      if (typeof (workflow.config as { target?: unknown }).target === "number") return "invalid" as const;
      workflow = { ...workflow, config: { ...workflow.config, target } };
      return { ok: true as const, archetype: workflow.archetype, goalKind: goal?.kind ?? "" };
    }),
  };
  const engine = createWorkflowEngine({
    store,
    readBalances: vi.fn(async () => opts?.balances ?? []),
    emit: vi.fn(async (event, _u, payload) => {
      emitted.push({ event, payload });
    }),
    audit: vi.fn(async (action, _u, context) => {
      audited.push({ action, context });
    }),
  });
  return { engine, store, emitted, audited, getWorkflow: () => workflow };
}

// ── getOrCreateWorkflow ─────────────────────────────────────────────────────
describe("engine.getOrCreateWorkflow (two-phase assembly)", () => {
  it("none when the user has no live goal", async () => {
    const { engine } = makeFakes({ goal: null });
    expect(await engine.getOrCreateWorkflow("u1")).toEqual({ state: "none" });
  });

  it("none for an unmapped goalKind — the WLT-11 placeholder stays (AC12)", async () => {
    const { engine, store } = makeFakes({ goal: { id: "g1", kind: "pay_off_debt", status: "pending_workflow" } });
    expect(await engine.getOrCreateWorkflow("u1")).toEqual({ state: "none" });
    expect(store.insertWorkflow).not.toHaveBeenCalled();
  });

  it("assembles pending_data and STAYS pending without real balances — never fake (AC3/AC4)", async () => {
    const { engine, emitted, audited } = makeFakes({ balances: [] });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view.state).toBe("pending_data");
    expect(emitted).toHaveLength(0); // not assembled-active yet → no event
    expect(audited).toHaveLength(0);
  });

  it("personalizes once balances exist: active view + goal flip + workflow_assembled {archetype, goal_kind} + audit (AC3/AC8)", async () => {
    const { engine, store, emitted, audited } = makeFakes({
      balances: [
        { kind: "depository", balanceCurrent: 31400 },
        { kind: "credit", balanceCurrent: 7220 },
      ],
    });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view).toMatchObject({ state: "active", config: { netWorth: 24180, assets: 31400, debts: 7220 } });
    expect(store.activateGoal).toHaveBeenCalledWith("g1");
    expect(emitted).toEqual([
      { event: "workflow_assembled", payload: { archetype: "networth_snapshot", goal_kind: "unified_view" } },
    ]);
    // The audit trail records the assemble transition (foundation L88).
    expect(audited).toEqual([
      {
        action: "workflow.assemble",
        context: { workflow_id: "wf1", archetype: "networth_snapshot", goal_kind: "unified_view" },
      },
    ]);
  });

  it("idempotent under the unique-index race: conflict → re-reads the winner (AC3)", async () => {
    const { engine } = makeFakes({ insertConflict: true, balances: [] });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view).toMatchObject({ state: "pending_data", workflowId: "wf-winner" });
  });

  it("lost the activate race → stays pending this load; no event, no audit", async () => {
    const { engine, emitted, audited } = makeFakes({
      activateFails: true,
      balances: [{ kind: "depository", balanceCurrent: 100 }],
    });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view.state).toBe("pending_data");
    expect(emitted).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it("a workflow with a set target reads as running (the persistent state)", async () => {
    const { engine } = makeFakes({
      existingWorkflow: {
        id: "wf1",
        goal_id: "g1",
        archetype: "networth_snapshot",
        status: "active",
        config: { netWorth: 100, assets: 100, debts: 0, suggestedTarget: 500, target: 1000 },
      },
    });
    expect(await engine.getOrCreateWorkflow("u1")).toMatchObject({ state: "running", target: 1000 });
  });
});

// ── completeAction ──────────────────────────────────────────────────────────
const ACTIVE: WorkflowRow = {
  id: "wf1",
  goal_id: "g1",
  archetype: "networth_snapshot",
  status: "active",
  config: { netWorth: 100, assets: 100, debts: 0, suggestedTarget: 500 },
};

describe("engine.completeAction (the WAWU unit — atomic, exactly once)", () => {
  it("commits atomically + emits action_completed {archetype, goal_kind} + audits workflow.action (AC5/AC8)", async () => {
    const { engine, emitted, audited, getWorkflow } = makeFakes({ existingWorkflow: { ...ACTIVE } });
    const res = await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 1234.567 });
    expect(res).toEqual({ ok: true, target: 1234.57 }); // cents-rounded
    expect((getWorkflow()?.config as { target?: number }).target).toBe(1234.57);
    // The WLT-5 funnel CONTRACT: same shape as workflow_assembled.
    expect(emitted).toEqual([
      { event: "action_completed", payload: { archetype: "networth_snapshot", goal_kind: "unified_view" } },
    ]);
    // The audit trail records the action (brief security mitigation).
    expect(audited).toEqual([
      {
        action: "workflow.action",
        context: { workflow_id: "wf1", archetype: "networth_snapshot", action_kind: "target_set" },
      },
    ]);
  });

  it("rejects a non-finite target before touching the store", async () => {
    const { engine, store } = makeFakes({ existingWorkflow: { ...ACTIVE } });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: Number.NaN })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(store.completeActionAtomic).not.toHaveBeenCalled();
  });

  it("rejects when the workflow isn't the caller's active workflow — no emit, no audit", async () => {
    const { engine, emitted, audited } = makeFakes({ existingWorkflow: null });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf-x", target: 100 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(emitted).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it("REPLAY: an already-completed action is invalid (in-transaction check) — no re-emit, no double audit", async () => {
    const { engine, emitted, audited } = makeFakes({
      existingWorkflow: { ...ACTIVE, config: { ...ACTIVE.config, target: 1000 } },
    });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 2000 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(emitted).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it("ATOMICITY: a store error means NOTHING happened — save_failed, no emit, no audit, workflow untouched", async () => {
    const { engine, emitted, audited, getWorkflow } = makeFakes({
      existingWorkflow: { ...ACTIVE },
      atomicResult: "error",
    });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 100 })).toEqual({
      ok: false,
      error: "save_failed",
    });
    expect(emitted).toHaveLength(0);
    expect(audited).toHaveLength(0);
    // The all-or-nothing guarantee: no half-committed target.
    expect((getWorkflow()?.config as { target?: number }).target).toBeUndefined();
  });
});

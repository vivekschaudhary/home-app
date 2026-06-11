// Workflow archetype registry (WLT-4) — the engine's template layer, mirroring
// INTENT_CLUSTERS in intent.ts. Each archetype maps a set of Goal.kinds to one
// pre-built workflow: a pure `personalize` over the user's REAL aggregated data
// and ONE platform-prompted action (whose completion = a WorkflowRun = the WAWU
// unit). Selection + validation both go through archetypeForGoalKind — an
// unknown/unmapped kind is never assembled (server-validated, like intents).
//
// WLT-12 ships `networth_snapshot` (5 goalKinds, balances-only). The remaining
// archetypes (savings_rule, spending_snapshot, budget_guardrail,
// cashflow_forecast, debt_payoff) land one per story; the bet's exit gate is the
// total-coverage test (every goalKind in INTENT_CLUSTERS resolves — see
// docs/bets/WLT-4/architecture.md). Until then, unmapped kinds keep the WLT-11
// "putting your plan together" placeholder (story AC12 — no regression).

/** A synced account's balance snapshot — the personalization input (no PII). */
export interface AccountBalance {
  /** 'depository' (asset) | 'credit' (debt) — the 0003 financial_accounts kinds. */
  kind: string;
  /** Current balance; null when the provider hasn't reported one yet. */
  balanceCurrent: number | null;
}

/** networth_snapshot's personalized config — amounts only, no PII. */
export interface NetWorthConfig {
  netWorth: number;
  assets: number;
  debts: number;
  suggestedTarget: number;
}

export interface WorkflowArchetype {
  /** Stable key — the DB/API contract; never change once shipped. */
  key: string;
  /** Goal.kinds (from INTENT_CLUSTERS) this archetype serves. */
  goalKinds: readonly string[];
  /** The one platform-prompted action's kind (the WorkflowRun.kind it records). */
  actionKind: string;
}

export const NETWORTH_SNAPSHOT = {
  key: "networth_snapshot",
  goalKinds: ["unified_view", "grow_wealth", "long_range_plan", "financial_checkup", "understand_money"],
  actionKind: "target_set",
} as const satisfies WorkflowArchetype;

/** The registry. WLT-12: networth_snapshot only; later stories append here. */
export const WORKFLOW_ARCHETYPES: readonly WorkflowArchetype[] = [NETWORTH_SNAPSHOT];

const BY_GOAL_KIND: ReadonlyMap<string, WorkflowArchetype> = new Map(
  WORKFLOW_ARCHETYPES.flatMap((a) => a.goalKinds.map((k) => [k, a] as const)),
);

/**
 * Resolve a Goal.kind to its archetype, or null if not (yet) mapped. null means
 * "keep the WLT-11 placeholder" — selection AND server-side validation.
 */
export function archetypeForGoalKind(goalKind: string): WorkflowArchetype | null {
  return BY_GOAL_KIND.get(goalKind) ?? null;
}

/**
 * Personalize networth_snapshot from REAL balances (assets − debts). Returns
 * null when no account has a reported balance — the workflow must then stay
 * `pending_data` (never a fake/zero figure — the real-data guardrail, AC4).
 */
export function personalizeNetWorth(accounts: readonly AccountBalance[]): NetWorthConfig | null {
  const reported = accounts.filter((a) => a.balanceCurrent !== null);
  if (reported.length === 0) return null;
  let assets = 0;
  let debts = 0;
  for (const a of reported) {
    if (a.kind === "credit") debts += a.balanceCurrent as number;
    else assets += a.balanceCurrent as number;
  }
  // Round to cents — these are currency amounts, not floats-in-the-wild.
  assets = round2(assets);
  debts = round2(debts);
  const netWorth = round2(assets - debts);
  return { netWorth, assets, debts, suggestedTarget: suggestTarget(netWorth) };
}

/**
 * A forward-looking first target: ~10% above today, rounded UP to a friendly
 * $500 step, always at least $500 ahead (works for negative net worth too).
 */
export function suggestTarget(netWorth: number): number {
  const ahead = Math.max(netWorth * 1.1, netWorth + 500);
  return Math.ceil(ahead / 500) * 500;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

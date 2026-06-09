// Canonical intent taxonomy (WLT-3 / WLT-11) — the single source of truth the
// front-door UI renders from AND the API validates + persists from. `intent_key`
// is the contract: stable, enumerable, what WLT-4 will consume via the derived
// `goalKind`. Labels + headers are VERBATIM from
// docs/bets/WLT-3/stories/WLT-11/copy.md (the taxonomy is both data and copy).

export type IntentCluster = "fear" | "goal" | "confusion" | "control" | "habit" | "aspiration";

export interface StarterIntent {
  /** Stable key — the API/DB contract; never change once shipped. */
  intentKey: string;
  /** First-person label, verbatim from copy.md. */
  label: string;
  /** Derived objective — the WLT-4 hand-off (`goals.kind`). */
  goalKind: string;
}

export interface ClusterDef {
  cluster: IntentCluster;
  /** Cluster header, verbatim from copy.md. */
  header: string;
  intents: StarterIntent[];
}

export const INTENT_CLUSTERS: readonly ClusterDef[] = [
  {
    cluster: "fear",
    header: "What's worrying you?",
    intents: [
      { intentKey: "fear_overspending", label: "I think I'm overspending", goalKind: "control_spending" },
      { intentKey: "fear_not_enough", label: "I'm scared I won't have enough", goalKind: "build_safety_net" },
      { intentKey: "fear_where_it_goes", label: "I don't know where my money goes", goalKind: "understand_spending" },
    ],
  },
  {
    cluster: "goal",
    header: "What are you working toward?",
    intents: [
      { intentKey: "goal_save_specific", label: "Save for something specific", goalKind: "save_specific" },
      { intentKey: "goal_pay_off_debt", label: "Pay off debt", goalKind: "pay_off_debt" },
      { intentKey: "goal_emergency_fund", label: "Build an emergency fund", goalKind: "emergency_fund" },
    ],
  },
  {
    cluster: "confusion",
    header: "Want to make sense of it?",
    intents: [
      { intentKey: "confusion_understand", label: "Help me understand my money", goalKind: "understand_money" },
      { intentKey: "confusion_doing_okay", label: "Am I doing okay?", goalKind: "financial_checkup" },
    ],
  },
  {
    cluster: "control",
    header: "Want to get a grip?",
    intents: [
      { intentKey: "control_one_place", label: "See all my money in one place", goalKind: "unified_view" },
      { intentKey: "control_whats_coming", label: "Know what's coming up", goalKind: "cashflow_forecast" },
    ],
  },
  {
    cluster: "habit",
    header: "Want to build a routine?",
    intents: [
      { intentKey: "habit_save_regularly", label: "Build a saving habit", goalKind: "savings_habit" },
      { intentKey: "habit_stick_to_budget", label: "Stick to a budget", goalKind: "budget_adherence" },
    ],
  },
  {
    cluster: "aspiration",
    header: "Thinking bigger?",
    intents: [
      { intentKey: "aspiration_grow_wealth", label: "Grow my wealth", goalKind: "grow_wealth" },
      { intentKey: "aspiration_plan_future", label: "Plan for my future", goalKind: "long_range_plan" },
    ],
  },
];

const BY_KEY: ReadonlyMap<string, { cluster: IntentCluster; intent: StarterIntent }> = new Map(
  INTENT_CLUSTERS.flatMap((c) => c.intents.map((i) => [i.intentKey, { cluster: c.cluster, intent: i }] as const)),
);

/**
 * Validate a declared {cluster, intentKey} against the taxonomy. Returns the
 * resolved intent or null — the API rejects null (never persists an unknown
 * intent). The cluster must match the key's cluster (no spoofing).
 */
export function resolveIntent(
  cluster: string,
  intentKey: string,
): { cluster: IntentCluster; intent: StarterIntent } | null {
  const found = BY_KEY.get(intentKey);
  if (!found || found.cluster !== cluster) return null;
  return found;
}

/** Derive the Goal (WLT-4 hand-off) from a resolved starter intent. */
export function deriveGoal(intent: StarterIntent): { kind: string; params: Record<string, never> } {
  return { kind: intent.goalKind, params: {} };
}

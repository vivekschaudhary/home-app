// WLT-11 — intent declaration (server). Validates against the canonical taxonomy
// (@wealth/core), persists Intent + derived Goal under owner-CRUD RLS (the user
// writes their own), emits the intent_declared funnel baseline. No AAL2 gate —
// declaring a goal is low-sensitivity (unlike connecting a bank).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS, deriveGoal, resolveIntent } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

export type DeclareResult =
  | { ok: true; goalId: string }
  | { ok: false; error: "invalid_intent" | "save_failed" };

export async function declareIntent(input: {
  userId: string;
  cluster: string;
  intentKey: string;
}): Promise<DeclareResult> {
  // Validate against the taxonomy — never persist an unknown/spoofed intent.
  const resolved = resolveIntent(input.cluster, input.intentKey);
  if (!resolved) return { ok: false, error: "invalid_intent" };

  const supabase = await createServerSupabase(); // RLS: owner inserts their own
  const { data: intent, error: iErr } = await supabase
    .from("intents")
    .insert({
      user_id: input.userId,
      cluster: resolved.cluster,
      intent_key: resolved.intent.intentKey,
      label: resolved.intent.label, // canonical label (not client-supplied)
    })
    .select("id")
    .single();
  if (iErr || !intent) return { ok: false, error: "save_failed" };
  const intentId = (intent as { id: string }).id;

  const goal = deriveGoal(resolved.intent);
  const { data: goalRow, error: gErr } = await supabase
    .from("goals")
    .insert({ user_id: input.userId, intent_id: intentId, kind: goal.kind, params: goal.params })
    .select("id")
    .single();
  if (gErr || !goalRow) {
    // Roll back the orphaned intent — declare is all-or-nothing.
    await supabase.from("intents").delete().eq("id", intentId);
    return { ok: false, error: "save_failed" };
  }

  await emitFunnel(FUNNEL_EVENTS.INTENT_DECLARED, input.userId, {
    cluster: resolved.cluster,
    intent_key: resolved.intent.intentKey, // no PII, no free-text
  });
  return { ok: true, goalId: (goalRow as { id: string }).id };
}

/** Routing gate: has this user already declared a (non-deleted) intent? */
export async function hasDeclaredIntent(userId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("intents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}

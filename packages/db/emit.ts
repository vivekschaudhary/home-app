import { createServiceSupabase } from "@vivekschaudhary/passkey-2fa";
import type { AuditAction, FunnelEvent } from "@wealth/core";

// Server-side, best-effort writers for the append-only audit trail (AC9) and
// the auth funnel (AC10). Both run under the service role (RLS-bypassing) since
// users can't insert these under default-deny RLS. Failures are logged, never
// thrown — auth must not break because an audit insert hiccuped. `context` must
// contain NO PII (cross-cutting standards / AC9).

export async function emitAudit(
  action: AuditAction,
  userId: string | null,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const svc = createServiceSupabase();
    const { error } = await svc.from("audit_events").insert({ action, user_id: userId, context });
    if (error) console.error("[audit] insert failed", action, error.message);
  } catch (err) {
    console.error("[audit] insert threw", action, err);
  }
}

export async function emitFunnel(
  event: FunnelEvent,
  userId: string | null,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const svc = createServiceSupabase();
    const { error } = await svc
      .from("auth_funnel_events")
      .insert({ event, user_id: userId, context });
    if (error) console.error("[funnel] insert failed", event, error.message);
  } catch (err) {
    console.error("[funnel] insert threw", event, err);
  }
}

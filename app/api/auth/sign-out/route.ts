import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@wealth/core";
import { emitAudit } from "@wealth/db/emit";
import { createServerSupabase } from "@wealth/db/server";
import { clearAal2Cookie } from "@/app/lib/auth-guard";

export const runtime = "nodejs";

// CSRF posture (Security Review LOW): sign-out is POST-only (never GET) and its
// only effect is clearing the caller's own session — a forged cross-site POST
// could at worst log the user out, not escalate. Accepted for now; if/when
// state-changing authenticated POSTs land, add a CSRF token / origin check
// app-wide rather than per-route.
export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await clearAal2Cookie();
  await supabase.auth.signOut();
  if (user) await emitAudit(AUDIT_ACTIONS.SIGNOUT, user.id);

  return NextResponse.json({ ok: true });
}

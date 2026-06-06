import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@wealth/core";
import { emitAudit } from "@wealth/db/emit";
import { createServerSupabase } from "@wealth/db/server";
import { clearAal2Cookie } from "@/app/lib/auth-guard";

export const runtime = "nodejs";

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

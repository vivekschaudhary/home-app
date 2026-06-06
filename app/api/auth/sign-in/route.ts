import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, signInSchema } from "@wealth/core";
import { emitAudit } from "@wealth/db/emit";
import { createServerSupabase } from "@wealth/db/server";
import { clientIp, rateLimit, tooManyRequests } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Throttle credential attempts per IP (Security Review MEDIUM).
  const limit = rateLimit(`signin:${clientIp(req)}`, 10, 5 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  }

  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { ok: false, error: field === "email" ? "validation_email" : "validation_password" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    // Non-revealing: do not disclose whether the email exists (AC6).
    await emitAudit(AUDIT_ACTIONS.SIGNIN_FAILURE, null);
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  // AAL1 only. The session is NOT app-privileged until the passkey challenge
  // succeeds (AAL2). Client advances to the passkey challenge next.
  return NextResponse.json({ ok: true });
}

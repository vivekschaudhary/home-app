import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, FUNNEL_EVENTS, signUpSchema } from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";
import { createServerSupabase } from "@wealth/db/server";
import { clientIp, rateLimit, tooManyRequests } from "@/app/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Throttle account creation per IP (Security Review MEDIUM).
  const limit = rateLimit(`signup:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { ok: false, error: field === "email" ? "validation_email" : "validation_password" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "server" }, { status: 400 });
  }
  if (!data.session) {
    // Email confirmation is enabled on the project — the passkey-at-sign-up flow
    // needs an immediate session. Surface clearly rather than stranding the user.
    return NextResponse.json({ ok: false, error: "email_confirmation_required" }, { status: 400 });
  }

  await emitAudit(AUDIT_ACTIONS.SIGNUP, data.user.id);
  await emitFunnel(FUNNEL_EVENTS.SIGNUP_CREDENTIALS_CREATED, data.user.id);
  return NextResponse.json({ ok: true });
}

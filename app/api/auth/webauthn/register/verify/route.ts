import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { AUDIT_ACTIONS, FUNNEL_EVENTS } from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";
import { getSessionUser, setAal2Cookie } from "@/app/lib/auth-guard";
import { verifyRegistration } from "@/app/lib/webauthn-service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "server" }, { status: 401 });

  let response: RegistrationResponseJSON;
  try {
    response = (await req.json()).response as RegistrationResponseJSON;
  } catch {
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  }

  const result = await verifyRegistration({ id: user.id, email: user.email ?? "" }, response);
  if (!result.verified) {
    return NextResponse.json({ ok: false, error: "verify" }, { status: 400 });
  }

  // Passkey enrolled → grant the AAL2 marker (the user is now fully signed in).
  await setAal2Cookie(user.id);
  await emitAudit(AUDIT_ACTIONS.MFA_ENROLL, user.id);
  await emitFunnel(FUNNEL_EVENTS.MFA_ENROLLED, user.id);
  return NextResponse.json({ ok: true });
}

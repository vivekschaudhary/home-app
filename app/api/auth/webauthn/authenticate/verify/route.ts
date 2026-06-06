import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AUDIT_ACTIONS, FUNNEL_EVENTS } from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";
import { getSessionUser, setAal2Cookie } from "@/app/lib/auth-guard";
import { verifyAuthentication } from "@/app/lib/webauthn-service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "server" }, { status: 401 });

  let response: AuthenticationResponseJSON;
  try {
    response = (await req.json()).response as AuthenticationResponseJSON;
  } catch {
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  }

  const result = await verifyAuthentication({ id: user.id, email: user.email ?? "" }, response);
  if (!result.verified) {
    await emitAudit(AUDIT_ACTIONS.MFA_CHALLENGE_FAILURE, user.id);
    return NextResponse.json({ ok: false, error: "verify" }, { status: 401 });
  }

  await setAal2Cookie(user.id);
  await emitAudit(AUDIT_ACTIONS.SIGNIN_SUCCESS, user.id);
  await emitFunnel(FUNNEL_EVENTS.SIGNIN_SUCCESS, user.id);
  return NextResponse.json({ ok: true });
}

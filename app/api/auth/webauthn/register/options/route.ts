import { NextResponse } from "next/server";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { getSessionUser } from "@/app/lib/auth-guard";
import { createRegistrationOptions } from "@/app/lib/webauthn-service";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "server" }, { status: 401 });

  const options = await createRegistrationOptions({ id: user.id, email: user.email ?? "" });
  await emitFunnel(FUNNEL_EVENTS.MFA_ENROLL_STARTED, user.id);
  return NextResponse.json(options);
}

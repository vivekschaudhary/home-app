import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-guard";
import { createAuthenticationOptions } from "@/app/lib/webauthn-service";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "server" }, { status: 401 });

  const options = await createAuthenticationOptions({ id: user.id, email: user.email ?? "" });
  return NextResponse.json(options);
}

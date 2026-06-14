import { NextResponse } from "next/server";
import { createServerSupabase } from "@vc1023/passkey-2fa";

// WLT-14 — Supabase recovery/auth callback. The reset email links here with a
// PKCE `code`; we exchange it for a (recovery, AAL1) session and redirect to the
// safe relative `next` path. Exchange must run in a route handler so the session
// cookies actually persist (an RSC silently drops cookie writes).
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Only allow same-origin relative redirects (no open-redirect).
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code).catch(() => {});
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

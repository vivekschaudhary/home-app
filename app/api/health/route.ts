import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Web canary endpoint. Proves the Next.js + Vercel stack composes and deploys.
 * Reports wiring of each platform dependency without failing when one is not
 * yet configured — so the canary stays green before Supabase/Inngest/Sentry
 * secrets are provisioned.
 */
export async function GET() {
  const checks = {
    app: "ok",
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "not-configured",
    inngest: process.env.INNGEST_SIGNING_KEY ? "configured" : "not-configured",
    sentry: process.env.SENTRY_DSN ? "configured" : "not-configured",
  };

  return NextResponse.json({
    status: "ok",
    service: "wealth-platform",
    checks,
    timestamp: new Date().toISOString(),
  });
}

// Deploy-time env preflight. Runs as part of `pnpm build` (see package.json).
//
// Purpose: a config-incomplete deploy must FAIL THE BUILD rather than ship and
// crash at runtime. This is the structural fix for the WLT-6 first-deploy
// outage, where production had no env vars and the middleware 500'd every route
// (MIDDLEWARE_INVOCATION_FAILED). The app's runtime guards are fail-loud by
// design; this moves the failure to build time, before anything is served.
//
// Gated on VERCEL_ENV so local + CI builds (which use placeholders or dev
// defaults) are not blocked:
//   - production : require the full set + validate the WebAuthn origin/RP-ID.
//                  FAILS the build on any problem (the load-bearing case).
//   - preview    : WARN if the Supabase trio is missing (preview would crash at
//                  runtime), but do not fail the build — previews are low-stakes
//                  and per-branch env may legitimately be absent.
//   - else       : skip (local dev, CI).

const target = process.env.VERCEL_ENV; // production | preview | development | undefined

const SUPABASE = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const PROD_ONLY = ["NEXT_PUBLIC_APP_URL", "WEBAUTHN_ORIGIN", "WEBAUTHN_RP_ID", "AUTH_MFA_SECRET"];

const isSet = (k) => typeof process.env[k] === "string" && process.env[k].length > 0;

if (target !== "production" && target !== "preview") {
  console.log(`• Env preflight skipped (VERCEL_ENV=${target ?? "local/CI"}).`);
  process.exit(0);
}

// Preview: warn-only (don't block the build).
if (target === "preview") {
  const missing = SUPABASE.filter((k) => !isSet(k));
  if (missing.length) {
    console.warn(
      `⚠ Env preflight (preview): missing ${missing.join(", ")} — this preview ` +
        `may crash at runtime. Set Preview env in Vercel to silence.`,
    );
  } else {
    console.log("✓ Env preflight passed for VERCEL_ENV=preview.");
  }
  process.exit(0);
}

// Production: strict — fail the build on any problem.
const required = [...SUPABASE, ...PROD_ONLY];
const errors = [];

const missing = required.filter((k) => !isSet(k));
if (missing.length) errors.push(`Missing required env: ${missing.join(", ")}`);

{
  const origin = process.env.WEBAUTHN_ORIGIN || "";
  if (origin && !origin.startsWith("https://")) {
    errors.push(`WEBAUTHN_ORIGIN must be https:// (got "${origin}")`);
  }
  try {
    const host = origin ? new URL(origin).hostname : "";
    const rp = process.env.WEBAUTHN_RP_ID || "";
    if (origin && rp && rp !== host) {
      errors.push(`WEBAUTHN_RP_ID ("${rp}") must equal the WEBAUTHN_ORIGIN host ("${host}")`);
    }
  } catch {
    // invalid origin already flagged above
  }
}

// Plaid (account aggregation, WLT-2). Ships dark: if Plaid is unconfigured, the
// feature is simply inactive — warn, don't block. But a PARTIAL config (e.g.
// PLAID_ENV=production with only the sandbox secret) silently breaks linking, so
// once any Plaid var is set, validate the whole group strictly.
{
  const plaidEnv = process.env.PLAID_ENV || "";
  const anyPlaid =
    isSet("PLAID_CLIENT_ID") ||
    isSet("PLAID_SANDBOX_SECRET") ||
    isSet("PLAID_PRODUCTION_SECRET") ||
    plaidEnv.length > 0;
  if (!anyPlaid) {
    console.warn(
      "⚠ Env preflight: Plaid not configured — account aggregation (WLT-2) will be inactive in production.",
    );
  } else {
    if (!isSet("PLAID_CLIENT_ID")) errors.push("Missing PLAID_CLIENT_ID (Plaid partially configured)");
    if (!["sandbox", "production"].includes(plaidEnv)) {
      errors.push(`PLAID_ENV must be "sandbox" or "production" (got "${plaidEnv}")`);
    }
    const secretKey = plaidEnv === "production" ? "PLAID_PRODUCTION_SECRET" : "PLAID_SANDBOX_SECRET";
    if (!isSet(secretKey)) errors.push(`Missing ${secretKey} (required for PLAID_ENV=${plaidEnv})`);
    // Aggregation's backfill runs on Inngest — required once Plaid is active, or
    // link/complete 502s after creating the connection (no event key to send to).
    for (const k of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"]) {
      if (!isSet(k)) errors.push(`Missing ${k} (aggregation backfill needs Inngest when Plaid is configured)`);
    }
    // PLAID_WEBHOOK_URL enables real-time sync (WLT-10). Without it, full history
    // still completes via the 6h cron — so it's a warning, not a hard failure.
    if (!isSet("PLAID_WEBHOOK_URL")) {
      console.warn(
        "⚠ Env preflight: PLAID_WEBHOOK_URL unset — real-time webhook sync disabled (full history still completes via the cron fallback). Set it to https://<host>/api/aggregation/plaid/webhook + register with Plaid.",
      );
    }
  }
}

if (errors.length) {
  console.error(`\n✗ Env preflight FAILED for VERCEL_ENV=${target}:`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nSet these in Vercel → Project → Settings → Environment Variables for the " +
      `${target} environment, then redeploy. Build aborted to prevent a broken deploy.\n`,
  );
  process.exit(1);
}

console.log(`✓ Env preflight passed for VERCEL_ENV=${target}.`);

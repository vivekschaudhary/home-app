#!/usr/bin/env node
// `npx passkey-2fa check-env` — verify the env @vc1023/passkey-2fa needs.
// Reads the project's .env.local (if present) merged over process.env, then
// reports which required vars are set/missing. Exit 1 if any required is missing.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WEBAUTHN_ORIGIN",
  "WEBAUTHN_RP_ID",
  "AUTH_MFA_SECRET",
];
const OPTIONAL = ["WEBAUTHN_RP_NAME", "NEXT_PUBLIC_APP_URL"];

function loadEnvLocal() {
  const out = {};
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/\r$/, "");
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const isSet = (k) => typeof env[k] === "string" && env[k].length > 0;

console.log("\n@vc1023/passkey-2fa — env check\n");
let missing = 0;
for (const k of REQUIRED) {
  const ok = isSet(k);
  if (!ok) missing++;
  console.log(`  ${ok ? "✓" : "✗"} ${k}${ok ? "" : "   (required, missing)"}`);
}
for (const k of OPTIONAL) {
  console.log(`  ${isSet(k) ? "✓" : "·"} ${k}${isSet(k) ? "" : "   (optional)"}`);
}

if (missing > 0) {
  console.error(
    `\n${missing} required variable(s) missing. Copy .env.example, fill them, and re-run.` +
      `\nSee node_modules/@vc1023/passkey-2fa/.env.example\n`,
  );
  process.exit(1);
}
console.log("\nAll required env present.\n");

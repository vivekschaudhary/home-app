// Server-only auth/WebAuthn configuration. Dev defaults are baked in; in
// production a missing value throws at module use (fail-loud per /build Phase 2
// runtime-config audit) rather than silently shipping a localhost RP ID.

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function fromEnvOrDevDefault(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProd()) {
    throw new Error(
      `Missing required production env: ${name}. A dev default (${devDefault}) is only used outside production.`,
    );
  }
  return devDefault;
}

/** WebAuthn Relying Party ID — the registrable domain (no scheme/port). */
export function rpID(): string {
  return fromEnvOrDevDefault("WEBAUTHN_RP_ID", "localhost");
}

export function rpName(): string {
  return process.env.WEBAUTHN_RP_NAME || "Wealth at Your Fingertips";
}

/** Expected origin of the WebAuthn ceremony (scheme + host + port). */
export function expectedOrigin(): string {
  return fromEnvOrDevDefault("WEBAUTHN_ORIGIN", "http://localhost:3000");
}

export function appUrl(): string {
  return fromEnvOrDevDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
}

/** HMAC secret for the AAL2 session token. MUST be set in production. */
export function mfaSecret(): string {
  return fromEnvOrDevDefault("AUTH_MFA_SECRET", "dev-insecure-mfa-secret-do-not-use-in-prod");
}

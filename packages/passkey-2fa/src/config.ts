// WebAuthn + AAL2 configuration, read from env (env-only convention). Dev
// defaults are baked in; in production a missing/invalid value throws at use
// (fail-loud) rather than shipping a localhost RP-ID or an insecure origin.

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function fromEnvOrDevDefault(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProd()) {
    throw new Error(
      `[@vc1023/passkey-2fa] Missing required production env: ${name}. ` +
        `A dev default (${devDefault}) is only used outside production.`,
    );
  }
  return devDefault;
}

/** Expected origin of the WebAuthn ceremony (scheme + host + port). https in prod. */
export function expectedOrigin(): string {
  const origin = fromEnvOrDevDefault("WEBAUTHN_ORIGIN", "http://localhost:3000");
  if (isProd() && !origin.startsWith("https://")) {
    throw new Error(
      `[@vc1023/passkey-2fa] WEBAUTHN_ORIGIN must be https:// in production (got "${origin}").`,
    );
  }
  return origin;
}

/** WebAuthn Relying Party ID — registrable domain (no scheme/port). In prod it
 *  MUST equal the WEBAUTHN_ORIGIN host. */
export function rpID(): string {
  const id = fromEnvOrDevDefault("WEBAUTHN_RP_ID", "localhost");
  if (isProd()) {
    let host = "";
    try {
      host = new URL(expectedOrigin()).hostname;
    } catch {
      host = "";
    }
    if (id !== host) {
      throw new Error(
        `[@vc1023/passkey-2fa] WEBAUTHN_RP_ID ("${id}") must equal the WEBAUTHN_ORIGIN host ("${host}") in production.`,
      );
    }
  }
  return id;
}

export function rpName(): string {
  return process.env.WEBAUTHN_RP_NAME || "Passkey 2FA";
}

export function appUrl(): string {
  return fromEnvOrDevDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
}

/** HMAC secret for the AAL2 session token. MUST be set in production. */
export function mfaSecret(): string {
  return fromEnvOrDevDefault("AUTH_MFA_SECRET", "dev-insecure-mfa-secret-do-not-use-in-prod");
}

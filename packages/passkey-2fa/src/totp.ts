// Authenticator-app (TOTP) second factor — the backup to the passkey.
// TOTP is Supabase-native MFA (the package's WebAuthn passkey is custom; TOTP is
// not). All operations run on the cookie-bound server client so they act on the
// signed-in user's session. On a verified code the caller mints the SAME AAL2
// cookie via setAal2Cookie — so the AAL2 gate works for either factor.

import { createServerSupabase, createServiceSupabase } from "./supabase";

export interface TotpEnrollResult {
  factorId: string;
  qrCode: string; // SVG data URI for the authenticator QR
  secret: string; // base32 secret (the manual-entry key + the a11y/text equivalent)
  uri: string; // otpauth:// URI
}

export interface FactorStatus {
  passkey: boolean;
  totp: boolean;
}

/** Pure guard (unit-tested): would removing a TOTP factor leave NO second factor? */
export function wouldLeaveNoSecondFactor(passkeyCount: number, totpCountAfterRemoval: number): boolean {
  return passkeyCount + totpCountAfterRemoval <= 0;
}

type SupabaseLike = Awaited<ReturnType<typeof createServerSupabase>>;

async function verifiedTotpFactors(supabase: SupabaseLike) {
  // Per the Supabase types, `data.totp` is verified-only; unverified factors
  // live in `data.all`.
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp ?? [];
}

async function passkeyCount(userId: string): Promise<number> {
  const svc = createServiceSupabase();
  const { count } = await svc
    .from("webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

/** Begin TOTP enrollment. Returns QR + secret to display. Requires AAL2 (caller-gated). */
export async function enrollTotp(): Promise<TotpEnrollResult | { error: string }> {
  const supabase = await createServerSupabase();
  const { data: list } = await supabase.auth.mfa.listFactors();
  if ((list?.totp ?? []).length > 0) return { error: "already_enrolled" };
  // Clean up any unverified stragglers from abandoned attempts (they live in `all`).
  const stragglers = (list?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "unverified",
  );
  for (const f of stragglers) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data || data.type !== "totp") {
    return { error: error?.message ?? "enroll_failed" };
  }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/** Complete enrollment by verifying the first code. Requires AAL2 (caller-gated). */
export async function verifyTotpEnrollment(
  factorId: string,
  code: string,
): Promise<{ verified: boolean; reason?: string }> {
  const supabase = await createServerSupabase();
  const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !ch) return { verified: false, reason: "challenge" };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  if (error) return { verified: false, reason: "verify" };
  return { verified: true };
}

/** Sign-in fallback: verify a code against the user's verified TOTP factor (AAL1). */
export async function verifyTotpChallenge(
  code: string,
): Promise<{ verified: boolean; reason?: string }> {
  const supabase = await createServerSupabase();
  const factor = (await verifiedTotpFactors(supabase))[0];
  if (!factor) return { verified: false, reason: "no_factor" };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { verified: false, reason: "verify" };
  return { verified: true };
}

/** Which second factors the user has (passkey from our table + verified TOTP). */
export async function getFactorStatus(userId: string): Promise<FactorStatus> {
  const supabase = await createServerSupabase();
  const totp = (await verifiedTotpFactors(supabase)).length > 0;
  return { passkey: (await passkeyCount(userId)) > 0, totp };
}

/** Remove the user's verified TOTP factor (there is at most one). Server-side
 *  last-factor guard. Requires AAL2 (caller-gated). */
export async function unenrollTotp(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createServerSupabase();
  const factors = await verifiedTotpFactors(supabase);
  const factor = factors[0];
  if (!factor) return { ok: false, reason: "no_factor" };
  const totpAfter = factors.filter((f) => f.id !== factor.id).length;
  if (wouldLeaveNoSecondFactor(await passkeyCount(userId), totpAfter)) {
    return { ok: false, reason: "last_factor" };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  return error ? { ok: false, reason: "unenroll_failed" } : { ok: true };
}

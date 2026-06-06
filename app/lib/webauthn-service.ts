// Custom WebAuthn passkey second factor (architecture ADR-001). All ceremony
// verification happens HERE, server-side. Challenges are single-use + expiring;
// the signature counter is persisted to resist replay (DRI Risk R5). Challenges
// and credential writes use the service-role client because users cannot write
// webauthn_challenges under default-deny RLS and counter updates are server-owned.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { WebAuthnCredentialRow } from "@wealth/db";
import { createServiceSupabase } from "@wealth/db/server";
import { expectedOrigin, rpID, rpName } from "./auth-config";

export interface AuthUser {
  id: string;
  email: string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
type ChallengeType = "registration" | "authentication";

// Return type is inferred (a fresh ArrayBuffer-backed Uint8Array) so it
// satisfies @simplewebauthn's WebAuthnCredential.publicKey without an explicit
// generic annotation.
function b64urlToBytes(s: string) {
  const b = Buffer.from(s, "base64url");
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  return Buffer.from(b).toString("base64url");
}

async function storeChallenge(userId: string, challenge: string, type: ChallengeType): Promise<void> {
  const svc = createServiceSupabase();
  // One live challenge per (user, type): clear prior, then insert.
  await svc.from("webauthn_challenges").delete().eq("user_id", userId).eq("type", type);
  await svc.from("webauthn_challenges").insert({
    user_id: userId,
    challenge,
    type,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
}

/** Fetch + delete (single-use) the latest challenge; null if missing/expired. */
async function consumeChallenge(userId: string, type: ChallengeType): Promise<string | null> {
  const svc = createServiceSupabase();
  const { data } = await svc
    .from("webauthn_challenges")
    .select("challenge, expires_at")
    .eq("user_id", userId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1);
  await svc.from("webauthn_challenges").delete().eq("user_id", userId).eq("type", type);
  const row = data?.[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.challenge;
}

export async function createRegistrationOptions(user: AuthUser) {
  const svc = createServiceSupabase();
  const { data: existing } = await svc
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id);
  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpID(),
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as never,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await storeChallenge(user.id, options.challenge, "registration");
  return options;
}

export async function verifyRegistration(
  user: AuthUser,
  response: RegistrationResponseJSON,
): Promise<{ verified: boolean; reason?: string }> {
  const expectedChallenge = await consumeChallenge(user.id, "registration");
  if (!expectedChallenge) return { verified: false, reason: "challenge" };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      requireUserVerification: false, // slice 1; Security Review may tighten to true
    });
  } catch {
    return { verified: false, reason: "verify" };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false, reason: "verify" };
  }

  const { credential, aaguid, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  const svc = createServiceSupabase();
  const { error } = await svc.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: bytesToB64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    aaguid,
  });
  if (error) return { verified: false, reason: "store" };
  return { verified: true };
}

export async function createAuthenticationOptions(user: AuthUser) {
  const svc = createServiceSupabase();
  const { data: creds } = await svc
    .from("webauthn_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id);
  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    allowCredentials: (creds ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as never,
    })),
    userVerification: "preferred",
  });
  await storeChallenge(user.id, options.challenge, "authentication");
  return options;
}

export async function verifyAuthentication(
  user: AuthUser,
  response: AuthenticationResponseJSON,
): Promise<{ verified: boolean; reason?: string }> {
  const expectedChallenge = await consumeChallenge(user.id, "authentication");
  if (!expectedChallenge) return { verified: false, reason: "challenge" };

  const svc = createServiceSupabase();
  const { data: rows } = await svc
    .from("webauthn_credentials")
    .select("*")
    .eq("user_id", user.id)
    .eq("credential_id", response.id)
    .limit(1);
  const cred = rows?.[0] as WebAuthnCredentialRow | undefined;
  if (!cred) return { verified: false, reason: "unknown_credential" };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpID(),
      requireUserVerification: false,
      credential: {
        id: cred.credential_id,
        publicKey: b64urlToBytes(cred.public_key),
        counter: Number(cred.counter),
        transports: (cred.transports ?? undefined) as never,
      },
    });
  } catch {
    return { verified: false, reason: "verify" };
  }
  if (!verification.verified) return { verified: false, reason: "verify" };

  await svc
    .from("webauthn_credentials")
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq("id", cred.id);
  return { verified: true };
}

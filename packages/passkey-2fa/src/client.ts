"use client";

// Browser helpers. They assume the route handlers are mounted under /api/auth
// (the documented convention). signUp/signIn/signOut wrap the credential
// endpoints; enrollPasskey/challengePasskey run the full WebAuthn ceremony +
// verify and return a UI-friendly result.

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { postForOptions, postJSON, type ApiErrorCode, type ApiResult } from "./api-client";

const BASE = "/api/auth";

export type { ApiResult, ApiErrorCode } from "./api-client";

// Isomorphic validation re-exported here so client components get it without
// importing the server barrel (which pulls node:crypto + next/headers).
export {
  signUpSchema,
  signInSchema,
  passwordStrength,
  PASSWORD_MIN,
  type SignUpInput,
  type SignInInput,
} from "./validation";

export type CeremonyResult = { ok: true } | { ok: false; reason: "cancelled" | "unsupported" | "error" };

/** True if this browser can do WebAuthn / passkeys. */
export function browserSupportsPasskeys(): boolean {
  return browserSupportsWebAuthn();
}

export function signUp(email: string, password: string): Promise<ApiResult> {
  return postJSON(`${BASE}/sign-up`, { email, password });
}

export function signIn(email: string, password: string): Promise<ApiResult> {
  return postJSON(`${BASE}/sign-in`, { email, password });
}

export function signOut(): Promise<ApiResult> {
  return postJSON(`${BASE}/sign-out`);
}

// Password reset (WLT-14).
export function requestPasswordReset(email: string): Promise<ApiResult> {
  return postJSON(`${BASE}/password/reset-request`, { email });
}

export function updatePassword(password: string): Promise<ApiResult> {
  return postJSON(`${BASE}/password/update`, { password });
}

/** Enroll a passkey (sign-up step 2). Runs the registration ceremony + verify. */
export async function enrollPasskey(): Promise<CeremonyResult> {
  const options = await postForOptions(`${BASE}/webauthn/register/options`);
  if (!options) return { ok: false, reason: "error" };
  let attResp;
  try {
    attResp = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "NotAllowedError" || name === "AbortError") return { ok: false, reason: "cancelled" };
    if (name === "NotSupportedError") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "error" };
  }
  const verify = await postJSON(`${BASE}/webauthn/register/verify`, { response: attResp });
  return verify.ok ? { ok: true } : { ok: false, reason: "error" };
}

/** Run the passkey challenge (sign-in step 2). */
export async function challengePasskey(): Promise<CeremonyResult> {
  const options = await postForOptions(`${BASE}/webauthn/authenticate/options`);
  if (!options) return { ok: false, reason: "error" };
  let authResp;
  try {
    authResp = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "NotAllowedError" || name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "error" };
  }
  const verify = await postJSON(`${BASE}/webauthn/authenticate/verify`, { response: authResp });
  return verify.ok ? { ok: true } : { ok: false, reason: "error" };
}

// ── Authenticator-app (TOTP) backup factor (WLT-7) ─────────────────────────

export type TotpEnrollStart =
  | { ok: true; factorId: string; qrCode: string; secret: string; uri: string }
  | { ok: false; error: ApiErrorCode };

export interface FactorStatus {
  passkey: boolean;
  totp: boolean;
}

/** Begin authenticator enrollment — returns the QR + manual key to display. */
export async function startTotpEnroll(): Promise<TotpEnrollStart> {
  const res = await postJSON(`${BASE}/totp/enroll/start`);
  if (!res.ok) return { ok: false, error: res.error ?? "server" };
  const d = res.data as Record<string, unknown>;
  return {
    ok: true,
    factorId: String(d.factorId),
    qrCode: String(d.qrCode),
    secret: String(d.secret),
    uri: String(d.uri),
  };
}

/** Confirm enrollment with the first 6-digit code. */
export function verifyTotpEnroll(factorId: string, code: string): Promise<ApiResult> {
  return postJSON(`${BASE}/totp/enroll/verify`, { factorId, code });
}

/** Sign-in fallback: complete the second factor with a 6-digit code. */
export function signInWithTotp(code: string): Promise<ApiResult> {
  return postJSON(`${BASE}/totp/challenge/verify`, { code });
}

/** Which second factors the signed-in user has (passkey / authenticator). */
export async function getFactors(): Promise<FactorStatus | null> {
  const res = await postJSON(`${BASE}/factors`);
  if (!res.ok) return null;
  const d = res.data as Record<string, unknown>;
  return { passkey: Boolean(d.passkey), totp: Boolean(d.totp) };
}

/** Remove the authenticator factor (blocked server-side if it's the last one). */
export function removeTotp(): Promise<ApiResult> {
  return postJSON(`${BASE}/totp/unenroll`);
}

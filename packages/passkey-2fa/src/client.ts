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
import { postForOptions, postJSON, type ApiResult } from "./api-client";

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

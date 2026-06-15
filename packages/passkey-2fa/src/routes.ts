// Next.js App Router route-handler factory. Mount these in your app's
// app/api/auth/**/route.ts files. Audit/analytics are emitted via the optional
// `onEvent` hook — the package itself stores no observability data.

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { emailSchema, passwordSchema, signInSchema, signUpSchema } from "./validation";
import { mapSignInError } from "./signin-error";
import { mapUpdatePasswordError } from "./update-password-error";
import { createServerSupabase } from "./supabase";
import { appUrl } from "./config";
import { clearAal2Cookie, getAal2UserId, getSessionUser, setAal2Cookie } from "./guard";
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";
import {
  enrollTotp,
  getFactorStatus,
  unenrollTotp,
  verifyTotpChallenge,
  verifyTotpEnrollment,
} from "./totp";
import { clientIp, inMemoryRateLimit, tooManyRequests, type RateLimiter } from "./rate-limit";
import type { OnAuthEvent } from "./events";

export type { AuthEvent, OnAuthEvent } from "./events";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface PasskeyAuthOptions {
  /** Hook for audit/analytics/funnel. Errors here are swallowed (best-effort). */
  onEvent?: OnAuthEvent;
  /** Rate limiter for the credential + ceremony routes. Defaults to a
   *  per-instance in-memory limiter; inject a distributed one (e.g. Upstash
   *  Redis) for multi-instance production — see the README. */
  rateLimit?: RateLimiter;
}

export interface PasskeyAuthHandlers {
  signUp: (req: Request) => Promise<Response>;
  signIn: (req: Request) => Promise<Response>;
  signOut: (req: Request) => Promise<Response>;
  registerOptions: (req: Request) => Promise<Response>;
  registerVerify: (req: Request) => Promise<Response>;
  authenticateOptions: (req: Request) => Promise<Response>;
  authenticateVerify: (req: Request) => Promise<Response>;
  // Authenticator-app (TOTP) backup factor (WLT-7).
  totpEnrollStart: (req: Request) => Promise<Response>;
  totpEnrollVerify: (req: Request) => Promise<Response>;
  totpChallengeVerify: (req: Request) => Promise<Response>;
  factorsList: (req: Request) => Promise<Response>;
  totpUnenroll: (req: Request) => Promise<Response>;
  // Password reset (WLT-14).
  requestPasswordReset: (req: Request) => Promise<Response>;
  updatePassword: (req: Request) => Promise<Response>;
}

export function createPasskeyAuthHandlers(opts: PasskeyAuthOptions = {}): PasskeyAuthHandlers {
  const limiter: RateLimiter = opts.rateLimit ?? inMemoryRateLimit;
  const emit: OnAuthEvent = async (e) => {
    try {
      await opts.onEvent?.(e);
    } catch {
      // best-effort: never let observability break auth
    }
  };

  return {
    async signUp(req) {
      const limit = await limiter(`signup:${clientIp(req)}`, 5, 10 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const parsed = signUpSchema.safeParse(body);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return json(
          { ok: false, error: field === "email" ? "validation_email" : "validation_password" },
          400,
        );
      }
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error || !data.user) return json({ ok: false, error: "server" }, 400);
      if (!data.session) {
        return json({ ok: false, error: "email_confirmation_required" }, 400);
      }
      await emit({ type: "signup", userId: data.user.id });
      return json({ ok: true });
    },

    async signIn(req) {
      const limit = await limiter(`signin:${clientIp(req)}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const parsed = signInSchema.safeParse(body);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return json(
          { ok: false, error: field === "email" ? "validation_email" : "validation_password" },
          400,
        );
      }
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error || !data.user) {
        await emit({ type: "signin_failure" });
        if (error) {
          // Diagnosis (#40) — log the REAL Supabase error so "wrong password" is
          // no longer the only thing we ever see. No PII: never the email/password.
          console.warn("[signIn] auth error", {
            code: (error as { code?: string }).code,
            status: (error as { status?: number }).status,
          });
        }
        const mapped = mapSignInError(error as { code?: string } | null);
        return json({ ok: false, error: mapped }, mapped === "server" ? 502 : 401);
      }
      // AAL1 only — not app-privileged until the passkey challenge succeeds.
      return json({ ok: true });
    },

    async signOut() {
      const supabase = await createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await clearAal2Cookie();
      await supabase.auth.signOut();
      if (user) await emit({ type: "signout", userId: user.id });
      return json({ ok: true });
    },

    // WLT-14 — request a reset link. ANTI-ENUMERATION: the response is identical
    // whether or not the email is registered (and whether Supabase errors); we
    // only fire the send when the address is well-formed. Rate-limited.
    async requestPasswordReset(req) {
      const limit = await limiter(`reset:${clientIp(req)}`, 5, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);
      const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
      const email = emailSchema.safeParse(body?.email);
      if (email.success) {
        const supabase = await createServerSupabase();
        // The recovery link targets /reset (the approved AC2 contract); /reset
        // bounces the PKCE code through the callback route for the cookie-safe
        // exchange (an RSC can't persist session cookies). Errors swallowed:
        // never leak account existence or timing.
        await supabase.auth
          .resetPasswordForEmail(email.data, { redirectTo: `${appUrl()}/reset` })
          .catch(() => {});
        await emit({ type: "password_reset_requested" }); // no userId — anti-enum
      }
      return json({ ok: true }); // identical in every case
    },

    // WLT-14 — set the new password under the recovery session established by the
    // callback. Recovers AAL1 only; the passkey (AAL2) still gates the app, and we
    // sign the recovery session out so the user re-authenticates cleanly.
    async updatePassword(req) {
      const limit = await limiter(`pwupdate:${clientIp(req)}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);
      const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
      const parsed = passwordSchema.safeParse(body?.password);
      if (!parsed.success) return json({ ok: false, error: "validation_password" }, 400);
      const supabase = await createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return json({ ok: false, error: "reset_link_invalid" }, 401); // link expired/used/absent
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) {
        // SUP-7 (#40 class): discriminate — a client-actionable rejection (same
        // password, weak/breached, rate limit) must NOT surface as an opaque 502.
        console.warn("[updatePassword] supabase error", {
          code: (error as { code?: string }).code,
          status: (error as { status?: number }).status,
        });
        const mapped = mapUpdatePasswordError(error as { code?: string; status?: number });
        return json({ ok: false, error: mapped }, mapped === "server" ? 502 : 400);
      }
      await emit({ type: "password_reset_completed", userId: user.id });
      await supabase.auth.signOut(); // clear the recovery session → re-auth (passkey) fresh
      return json({ ok: true });
    },

    async registerOptions() {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const options = await createRegistrationOptions({ id: user.id, email: user.email ?? "" });
      await emit({ type: "mfa_enroll_started", userId: user.id });
      return json(options);
    },

    async registerVerify(req) {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const limit = await limiter(`mfa-reg:${user.id}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let response: RegistrationResponseJSON;
      try {
        response = (await req.json()).response as RegistrationResponseJSON;
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const result = await verifyRegistration({ id: user.id, email: user.email ?? "" }, response);
      if (!result.verified) return json({ ok: false, error: "verify" }, 400);

      await setAal2Cookie(user.id);
      await emit({ type: "mfa_enrolled", userId: user.id });
      return json({ ok: true });
    },

    async authenticateOptions() {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const options = await createAuthenticationOptions({ id: user.id, email: user.email ?? "" });
      return json(options);
    },

    async authenticateVerify(req) {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const limit = await limiter(`mfa-auth:${user.id}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let response: AuthenticationResponseJSON;
      try {
        response = (await req.json()).response as AuthenticationResponseJSON;
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const result = await verifyAuthentication({ id: user.id, email: user.email ?? "" }, response);
      if (!result.verified) {
        await emit({ type: "mfa_challenge_failure", userId: user.id });
        return json({ ok: false, error: "verify" }, 401);
      }
      await setAal2Cookie(user.id);
      await emit({ type: "signin_success", userId: user.id, method: "passkey" });
      return json({ ok: true });
    },

    // ── Authenticator-app (TOTP) backup factor (WLT-7) ───────────────────────

    async totpEnrollStart() {
      const userId = await getAal2UserId();
      if (!userId) return json({ ok: false, error: "aal2_required" }, 401);
      const result = await enrollTotp();
      if ("error" in result) return json({ ok: false, error: result.error }, 400);
      await emit({ type: "totp_enroll_started", userId });
      // Secret returned only to the authenticated owner for setup; never logged.
      return json({
        ok: true,
        factorId: result.factorId,
        qrCode: result.qrCode,
        secret: result.secret,
        uri: result.uri,
      });
    },

    async totpEnrollVerify(req) {
      const userId = await getAal2UserId();
      if (!userId) return json({ ok: false, error: "aal2_required" }, 401);
      const limit = await limiter(`totp-enroll:${userId}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let factorId: string;
      let code: string;
      try {
        const body = await req.json();
        factorId = String(body.factorId);
        code = String(body.code);
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const result = await verifyTotpEnrollment(factorId, code);
      if (!result.verified) return json({ ok: false, error: result.reason ?? "invalid_code" }, 400);
      await setAal2Cookie(userId);
      await emit({ type: "totp_enrolled", userId });
      return json({ ok: true });
    },

    async totpChallengeVerify(req) {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const limit = await limiter(`totp-challenge:${user.id}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

      let code: string;
      try {
        code = String((await req.json()).code);
      } catch {
        return json({ ok: false, error: "unknown" }, 400);
      }
      const result = await verifyTotpChallenge(code);
      if (!result.verified) {
        await emit({ type: "totp_challenge_failure", userId: user.id });
        return json({ ok: false, error: result.reason ?? "invalid_code" }, 401);
      }
      await setAal2Cookie(user.id);
      await emit({ type: "signin_success", userId: user.id, method: "totp" });
      return json({ ok: true });
    },

    async factorsList() {
      const user = await getSessionUser();
      if (!user) return json({ ok: false, error: "server" }, 401);
      const status = await getFactorStatus(user.id);
      return json({ ok: true, passkey: status.passkey, totp: status.totp });
    },

    async totpUnenroll() {
      const userId = await getAal2UserId();
      if (!userId) return json({ ok: false, error: "aal2_required" }, 401);
      const limit = await limiter(`totp-unenroll:${userId}`, 10, 5 * 60 * 1000);
      if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);
      const result = await unenrollTotp(userId);
      if (!result.ok) return json({ ok: false, error: result.reason ?? "server" }, 400);
      return json({ ok: true });
    },
  };
}

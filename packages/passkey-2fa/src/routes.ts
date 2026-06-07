// Next.js App Router route-handler factory. Mount these in your app's
// app/api/auth/**/route.ts files. Audit/analytics are emitted via the optional
// `onEvent` hook — the package itself stores no observability data.

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { signInSchema, signUpSchema } from "./validation";
import { createServerSupabase } from "./supabase";
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
        return json({ ok: false, error: "invalid_credentials" }, 401);
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
      await emit({ type: "signin_success", userId: user.id });
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
      await emit({ type: "signin_success", userId: user.id });
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

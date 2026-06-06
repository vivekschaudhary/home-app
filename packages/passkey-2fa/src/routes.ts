// Next.js App Router route-handler factory. Mount these in your app's
// app/api/auth/**/route.ts files. Audit/analytics are emitted via the optional
// `onEvent` hook — the package itself stores no observability data.

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { signInSchema, signUpSchema } from "./validation";
import { createServerSupabase } from "./supabase";
import { clearAal2Cookie, getSessionUser, setAal2Cookie } from "./guard";
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn";
import { clientIp, rateLimit, tooManyRequests } from "./rate-limit";
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
}

export interface PasskeyAuthHandlers {
  signUp: (req: Request) => Promise<Response>;
  signIn: (req: Request) => Promise<Response>;
  signOut: (req: Request) => Promise<Response>;
  registerOptions: (req: Request) => Promise<Response>;
  registerVerify: (req: Request) => Promise<Response>;
  authenticateOptions: (req: Request) => Promise<Response>;
  authenticateVerify: (req: Request) => Promise<Response>;
}

export function createPasskeyAuthHandlers(opts: PasskeyAuthOptions = {}): PasskeyAuthHandlers {
  const emit: OnAuthEvent = async (e) => {
    try {
      await opts.onEvent?.(e);
    } catch {
      // best-effort: never let observability break auth
    }
  };

  return {
    async signUp(req) {
      const limit = rateLimit(`signup:${clientIp(req)}`, 5, 10 * 60 * 1000);
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
      const limit = rateLimit(`signin:${clientIp(req)}`, 10, 5 * 60 * 1000);
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
      const limit = rateLimit(`mfa-reg:${user.id}`, 10, 5 * 60 * 1000);
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
      const limit = rateLimit(`mfa-auth:${user.id}`, 10, 5 * 60 * 1000);
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
  };
}

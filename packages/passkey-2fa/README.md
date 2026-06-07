# @vc1023/passkey-2fa

Drop-in **password + passkey (WebAuthn) 2FA** for **Next.js App Router + Supabase**.

- Email + password = first factor (Supabase Auth, AAL1)
- A **passkey** = mandatory second factor (custom WebAuthn, AAL2), enforced server-side
- Single-use expiring challenges · replay-protected counter · session-bound AAL2 cookie · per-route rate limiting · fail-loud config

It ships server route-handler factories, an Edge middleware factory, browser helpers, and the SQL migration. Audit/analytics stay yours via an `onEvent` hook.

## 1. Install

```bash
npm install @vc1023/passkey-2fa
```

Add it to `transpilePackages` (it ships TypeScript source):

```ts
// next.config.ts
const nextConfig = { transpilePackages: ["@vc1023/passkey-2fa"] };
```

## 2. Environment

Copy `node_modules/@vc1023/passkey-2fa/.env.example` into `.env.local` and fill it. Then verify:

```bash
npx passkey-2fa check-env
```

| Var | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `WEBAUTHN_ORIGIN` (`https://yourapp.com`) · `WEBAUTHN_RP_ID` (`yourapp.com`) · `WEBAUTHN_RP_NAME` | your app's domain |
| `AUTH_MFA_SECRET` | `openssl rand -hex 32` |

In **production** these are required and validated (origin must be https; RP-ID must equal the origin host) — the app fails loud if any is missing. In dev they default to `localhost`.

> **Supabase setting:** disable email confirmation (Auth → Email) so the user is signed in immediately and can enroll a passkey in the same sign-up flow.

## 3. Database

Apply the migration to your Supabase project (SQL editor or `supabase db push`):

```
node_modules/@vc1023/passkey-2fa/migrations/0001_passkey_tables.sql
```

## 4. Mount the route handlers

Create one file per endpoint under `app/api/auth/…`, all delegating to a shared instance:

```ts
// app/lib/auth.ts
import { createPasskeyAuthHandlers } from "@vc1023/passkey-2fa/routes";

export const handlers = createPasskeyAuthHandlers({
  // optional: audit / analytics / funnel — never required
  onEvent: async (e) => { /* e.type: "signup" | "signin_success" | "mfa_enrolled" | … */ },
});
```

```ts
// app/api/auth/sign-up/route.ts
import { handlers } from "@/app/lib/auth";
export const runtime = "nodejs";
export const POST = handlers.signUp;
```

Repeat for: `sign-in` → `handlers.signIn`, `sign-out` → `handlers.signOut`,
`webauthn/register/options` → `handlers.registerOptions`, `webauthn/register/verify` → `handlers.registerVerify`,
`webauthn/authenticate/options` → `handlers.authenticateOptions`, `webauthn/authenticate/verify` → `handlers.authenticateVerify`.

## 5. Middleware

```ts
// middleware.ts
import { createPasskeyMiddleware } from "@vc1023/passkey-2fa/middleware";

export const middleware = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

## 6. Protect a page (server-side AAL2 gate)

```tsx
// app/dashboard/page.tsx
import { requireAal2, getSessionUser } from "@vc1023/passkey-2fa";
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAal2();            // redirects to /sign-in unless fully AAL2
  const user = await getSessionUser();
  return <p>Signed in as {user?.email}</p>;
}
```

## 7. Build your UI with the client helpers

You own the screens/copy; the package gives the network + ceremony:

```tsx
"use client";
import {
  signUp, enrollPasskey, signIn, challengePasskey, signOut, browserSupportsPasskeys,
} from "@vc1023/passkey-2fa/client";

// sign-up: await signUp(email, password) → if ok, await enrollPasskey()
// sign-in: await signIn(email, password) → if ok, await challengePasskey()
// each ceremony returns { ok:true } | { ok:false, reason:"cancelled"|"unsupported"|"error" }
```

## Distributed rate limiting (optional)

The default limiter is in-memory and **per-instance** (fine for one instance; not shared across serverless instances/regions). For multi-instance production, inject a distributed `RateLimiter` — e.g. Upstash Redis:

```ts
// app/lib/auth.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createPasskeyAuthHandlers, type RateLimiter } from "@vc1023/passkey-2fa/routes";

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
const cache = new Map<string, Ratelimit>();

const rateLimit: RateLimiter = async (key, limit, windowMs) => {
  const id = `${limit}:${windowMs}`;
  let rl = cache.get(id);
  if (!rl) {
    rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`), prefix: "pk2fa" });
    cache.set(id, rl);
  }
  const r = await rl.limit(key);
  return { ok: r.success, retryAfterSeconds: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)) };
};

export const handlers = createPasskeyAuthHandlers({ rateLimit /*, onEvent */ });
```

`RateLimiter` is `(key, limit, windowMs) => RateLimitResult | Promise<RateLimitResult>` — the per-endpoint limit/window are passed in, so one implementation serves every route.

## Notes
- Route handlers run on `runtime = "nodejs"` (the AAL2 token uses `node:crypto`). The middleware is Edge-safe.
- The AAL2 session is **bound to the Supabase session id** (fail-closed): a stolen AAL2 cookie can't elevate a different session.
- Server validation is enforced; you may also `signUpSchema.safeParse()` client-side for instant feedback.

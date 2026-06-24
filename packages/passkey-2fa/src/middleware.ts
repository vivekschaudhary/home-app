// Edge-safe Next.js middleware factory. Refreshes the Supabase (AAL1) session
// cookies so sessions survive reload + restart, does a coarse redirect for
// unauthenticated hits on protected paths, AND slides the AAL2 second-factor
// marker forward on every request so an actively-browsing session never hits the
// hard 1h boundary. The full AAL2 (second-factor) GRANT runs server-side in the
// protected page via `requireAal2()`; this only RENEWS an already-valid marker.
//
// WHY RENEWAL LIVES HERE (the "forced logout every few hours" follow-up): the
// guard's renewal write (`getAal2UserId`) is swallowed during a Server Component
// render (Next forbids `cookies().set()` there), so a read-only/browsing session
// never persisted a renewal and was bounced at the 1h mark. The middleware runs
// on every request — page navigations included — and CAN set response cookies,
// so it is the authoritative renewal seam.
//
// SINGLE SESSION READ PER REQUEST (the forced-logout regression #3): this
// middleware runs on EVERY request, and Next.js fires CONCURRENT middleware
// invocations per navigation (link prefetch + the RSC/data request). Each
// Supabase session read can trigger a refresh-token ROTATION, and Supabase
// REVOKES THE WHOLE SESSION on detected reuse of an already-rotated refresh
// token. Reading the session twice per request (getUser() for the gate THEN
// getSession() for the AAL2 `sid`) doubled the per-request rotation surface and
// widened the race window in which two in-flight requests both present the same
// refresh token → spurious session revocation → "forced logout every few hours",
// independent of the AAL2 TTL. We therefore validate the session ONCE
// (getSession) and derive the AAL2 `sid` from that SAME result — never a second
// token-mutating round-trip. The AUTHORITATIVE AAL1+AAL2 validation still runs
// server-side (Node runtime) in `requireAal2()`/`getUser()` at the page; this
// edge gate is intentionally coarse.
//
// IMPORTANT: Edge runtime. Only imports `@supabase/ssr`, `./env`, `./config`,
// and `./aal2-edge` (WebCrypto, NOT node:crypto). Do NOT add imports that pull
// in node:crypto — that includes `./aal2` and `./guard`.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { AAL2_COOKIE } from "./aal2-constants";
import { mfaSecret } from "./config";
import { renewedAal2CookieEdge } from "./aal2-edge";

export interface PasskeyMiddlewareOptions {
  /** Path prefixes that require an authenticated (AAL1) session. */
  protectedPaths: string[];
  /** Where to send unauthenticated users. Default `/sign-in`. */
  signInPath?: string;
}

/** Read the `session_id` claim out of a Supabase access token (JWT) without a
 *  full verify — the token came from the trusted Supabase client. Edge-safe. */
function sessionIdFromAccessToken(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad);
    const payload = JSON.parse(json) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

export function createPasskeyMiddleware(opts: PasskeyMiddlewareOptions) {
  const signInPath = opts.signInPath ?? "/sign-in";

  return async function middleware(req: NextRequest) {
    let res = NextResponse.next({ request: req });

    const supabase = createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet)
            res.cookies.set(name, value, options);
        },
      },
    });

    // ONE session read per request. getSession() validates the SSR-managed
    // session, refreshes the access token if needed (refreshed cookies flow
    // through setAll above), and returns BOTH the user (for the coarse gate)
    // AND the access token (for the AAL2 `sid`). Calling getUser() as well would
    // be a SECOND refresh-token-rotation trigger — the forced-logout regression
    // #3. The authoritative AAL1+AAL2 validation runs server-side at the page
    // (`requireAal2()`), so the coarse user-presence check here is sufficient.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const path = req.nextUrl.pathname;
    const isProtected = opts.protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
    if (isProtected && !user) {
      const url = req.nextUrl.clone();
      url.pathname = signInPath;
      return NextResponse.redirect(url);
    }

    // Slide the AAL2 marker forward for an active session. Fail-closed +
    // best-effort: any problem reading the session / secret leaves the marker
    // untouched (the Node guard still enforces validity on the read path; an
    // un-renewed but still-valid marker simply renews on a later request, and a
    // genuinely expired one re-challenges). We renew using the REQUEST cookie
    // value the browser sent, not a value we may have just rewritten, and the
    // `sid` comes from the SAME session read above — no second round-trip.
    if (user) {
      try {
        const rawAal2 = req.cookies.get(AAL2_COOKIE)?.value;
        if (rawAal2) {
          const sid = sessionIdFromAccessToken(session?.access_token);
          if (sid) {
            const secure = process.env.NODE_ENV === "production";
            const renewal = await renewedAal2CookieEdge(rawAal2, user.id, sid, mfaSecret(), secure);
            if (renewal) {
              res.cookies.set(renewal.name, renewal.value, renewal.options);
            }
          }
        }
      } catch {
        // Renewal is best-effort. Never let a renewal hiccup break the request
        // or the AAL1 refresh above; the guard remains authoritative for grants.
      }
    }

    return res;
  };
}

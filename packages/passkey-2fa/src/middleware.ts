// Edge-safe Next.js middleware factory. Refreshes the Supabase (AAL1) session
// cookies so sessions survive reload + restart, and does a coarse redirect for
// unauthenticated hits on protected paths. The full AAL2 (second-factor) gate
// runs server-side in the protected page via `requireAal2()` — it needs
// node:crypto, unavailable in the Edge runtime, so it is NOT done here.
//
// IMPORTANT: only imports `@supabase/ssr` + `./env` (both Edge-safe). Do not add
// imports that pull in node:crypto.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

export interface PasskeyMiddlewareOptions {
  /** Path prefixes that require an authenticated (AAL1) session. */
  protectedPaths: string[];
  /** Where to send unauthenticated users. Default `/sign-in`. */
  signInPath?: string;
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = req.nextUrl.pathname;
    const isProtected = opts.protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
    if (isProtected && !user) {
      const url = req.nextUrl.clone();
      url.pathname = signInPath;
      return NextResponse.redirect(url);
    }

    return res;
  };
}

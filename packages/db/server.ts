import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/**
 * Request-scoped Supabase client bound to the Next cookie store (App Router).
 * Carries the user's AAL1 session; RLS keys on auth.uid(). SSR-safe so sessions
 * persist across reload + restart (AC2).
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll called from a Server Component — safe to ignore; the
          // middleware refresh path owns cookie writes.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. SERVER-ONLY. Used strictly for
 * server-controlled writes the user can't make under RLS: webauthn_challenges,
 * audit_events, auth_funnel_events, and credential counter updates during auth.
 * Never expose to the client; never use it to read user data without an
 * explicit user_id scope.
 */
export function createServiceSupabase() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

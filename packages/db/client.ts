"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/** Browser Supabase client (anon key). Used in client components for the
 *  email+password (AAL1) flows; the passkey 2FA is handled via our route
 *  handlers + @simplewebauthn/browser. */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL(), SUPABASE_ANON_KEY());
}

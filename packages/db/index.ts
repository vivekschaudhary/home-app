// @wealth/db — Supabase clients, schema types, RLS helpers.
// Tenancy is enforced by Postgres RLS keyed on auth.uid() (Supabase Auth).
// See docs/foundation/architecture.md → Foundational Data Model + Layer 3.
//
// Runtime clients are split by environment to keep server-only code (next/headers,
// service role) out of client bundles:
//   - browser:  import { createBrowserSupabase } from "@wealth/db/client"
//   - server:   import { createServerSupabase, createServiceSupabase } from "@wealth/db/server"
//   - emitters: import { emitAudit, emitFunnel } from "@wealth/db/emit"
// This barrel re-exports only the isomorphic row types.
export * from "./types";

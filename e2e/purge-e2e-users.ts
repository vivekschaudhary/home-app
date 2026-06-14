import { Client } from "pg";

/**
 * Purge gated-E2E residue — the `e2e-*@example.com` users (and their cascade:
 * connections, accounts, intents, goals, workflows, runs) — from whatever
 * `SUPABASE_DB_URL` points at.
 *
 * The gated specs (E2E_PASSKEY=1) create REAL users via the real signup flow; if
 * `SUPABASE_DB_URL` points at a shared/prod project they accumulate and pollute
 * real data + the metrics views (this bit us: stray "Test Credit Union" rows).
 * No-op when `SUPABASE_DB_URL` is unset (ungated CI runs don't touch a DB).
 *
 * NOTE: the proper fix is a dedicated test Supabase project for E2E. Until that's
 * provisioned, this self-clean keeps a shared project from accumulating residue.
 */
export async function purgeE2EUsers(): Promise<number> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return 0;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query("delete from auth.users where email like 'e2e-%@example.com'");
    return res.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

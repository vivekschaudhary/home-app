import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// WLT-10/#39 regression — the quiescence settle-sweep. The backfill's
// stabilization loop can cap before stamping history_synced_at on a long
// multi-account import, leaving the connection stuck "Importing…" until the 6h
// cron. The sweep stamps a connection that has SYNCED but gone QUIET for ≥5 min.
// This asserts the WHERE logic stamps exactly the right rows.

const DB_URL = process.env.SUPABASE_DB_URL;
const suite = DB_URL ? describe : describe.skip;
const U = "d0000000-0000-0000-0000-000000000099";

// The sweep's exact predicate (mirrors aggregationSettleSweep in sync.ts),
// scoped to the test user so the shared DB's real connections don't bleed in
// (the global sweep legitimately matches any quiesced row — incl. real ones).
const SWEEP = `
  update account_connections set history_synced_at = now()
  where user_id = $1
    and health_status = 'active'
    and history_synced_at is null
    and deleted_at is null
    and last_synced_at is not null
    and last_synced_at < now() - interval '5 minutes'`;

suite("settle sweep (#39): stamp quiesced, leave everything else", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  async function conn(
    last: string, // SQL expr for last_synced_at
    historySynced: boolean,
    health = "active",
    deleted = false,
  ): Promise<string> {
    const r = await client.query(
      `insert into account_connections
         (user_id, provider, provider_connection_id, vault_token_ref, institution_name,
          health_status, last_synced_at, history_synced_at, deleted_at)
       values ($1,'plaid',$2,gen_random_uuid(),'x',$3, ${last},
               ${historySynced ? "now()" : "null"}, ${deleted ? "now()" : "null"})
       returning id`,
      [U, `item-${Math.random()}`, health],
    );
    return r.rows[0].id;
  }
  const settled = async (id: string) =>
    (await client.query("select history_synced_at is not null as s from account_connections where id=$1", [id]))
      .rows[0].s as boolean;

  it("stamps active+unsettled+quiesced; skips recent / already-settled / needs_reauth / never-synced / deleted", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [U]);

      const quiesced = await conn("now() - interval '20 minutes'", false); // ← the fix: STAMP
      const recent = await conn("now() - interval '1 minute'", false); // still active → skip
      const already = await conn("now() - interval '20 minutes'", true); // already stamped → unchanged
      const reauth = await conn("now() - interval '20 minutes'", false, "needs_reauth"); // not active → skip
      const neverSynced = await conn("null", false); // backfill never ran → skip (don't fake)
      const deleted = await conn("now() - interval '20 minutes'", false, "active", true); // soft-deleted → skip

      const res = await client.query(SWEEP, [U]);
      expect(res.rowCount).toBe(1); // exactly one of the seeded rows qualified

      expect(await settled(quiesced)).toBe(true);
      expect(await settled(recent)).toBe(false);
      expect(await settled(reauth)).toBe(false);
      expect(await settled(neverSynced)).toBe(false);
      expect(await settled(deleted)).toBe(false);
      expect(await settled(already)).toBe(true); // unchanged
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

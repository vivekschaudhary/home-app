import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// Cross-tenant default-deny RLS test (AC8). Exercises the auth.uid() pattern on
// example_user_scoped (0001) — the FK-free convention table every user-scoped
// table (incl. webauthn_credentials) inherits. Runs against a real Postgres via
// SUPABASE_DB_URL; skipped (not failed) when the env is absent. CI must provide
// SUPABASE_DB_URL for this to execute.

const DB_URL = process.env.SUPABASE_DB_URL;
const suite = DB_URL ? describe : describe.skip;

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

suite("RLS default-deny cross-tenant", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  // Run a query as a given authenticated user (RLS applies because we switch
  // off the table-owner role and set the JWT sub claim auth.uid() reads).
  async function asUser(uid: string, sql: string, params: unknown[] = []) {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const res = await client.query(sql, params);
    await client.query("reset role");
    return res;
  }

  it("a tenant sees its own rows; another tenant sees none", async () => {
    await client.query("begin");
    try {
      await asUser(USER_A, "insert into example_user_scoped default values");
      const a = await asUser(USER_A, "select count(*)::int as n from example_user_scoped");
      expect(a.rows[0].n).toBeGreaterThanOrEqual(1);
      const b = await asUser(USER_B, "select count(*)::int as n from example_user_scoped");
      expect(b.rows[0].n).toBe(0);
    } finally {
      await client.query("rollback");
    }
  });

  it("a tenant cannot insert a row owned by another (WITH CHECK)", async () => {
    await client.query("begin");
    try {
      await expect(
        asUser(USER_A, "insert into example_user_scoped (user_id) values ($1)", [USER_B]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  });
});

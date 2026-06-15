import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// WLT-16 — the recap's data model under a REAL Postgres (SUPABASE_DB_URL).
// Skipped (not failed) when the env is absent. Covers:
//   * net_worth_snapshots — financial-table posture (owner-SELECT; service-role
//     writes only; cross-tenant default-deny) + daily upsert idempotency.
//   * complete_recap_action — atomic run+config commit, WEEKLY idempotency
//     (period), the once-ever target_set guard still holding, cross-tenant deny.
//   * metrics_return_weekly — distinct returners/week + the revoke boundary.

const DB_URL = process.env.SUPABASE_DB_URL;
const suite = DB_URL ? describe : describe.skip;

const USER_A = "d1111111-1111-1111-1111-111111111111";
const USER_B = "d2222222-2222-2222-2222-222222222222";

suite("recap RLS + idempotency (WLT-16)", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  async function asUser(uid: string, sql: string, params: unknown[] = []) {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const res = await client.query(sql, params);
    await client.query("reset role");
    return res;
  }

  /** Seed an intent+goal+ACTIVE workflow (service path) and return the workflow id. */
  async function seedActiveWorkflow(uid: string): Promise<string> {
    const i = await client.query(
      "insert into intents (user_id,cluster,intent_key,label) values ($1,'control','control_one_place','x') returning id",
      [uid],
    );
    const g = await client.query("insert into goals (user_id,intent_id,kind) values ($1,$2,'unified_view') returning id", [
      uid,
      i.rows[0].id,
    ]);
    const w = await client.query(
      `insert into workflows (user_id, goal_id, archetype, status, config)
       values ($1,$2,'networth_snapshot','active','{"netWorth":24000}'::jsonb) returning id`,
      [uid, g.rows[0].id],
    );
    return w.rows[0].id;
  }

  // ── net_worth_snapshots: financial-table posture ──
  it("net_worth_snapshots: authenticated cannot INSERT (service-role writes only)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      await expect(
        asUser(
          USER_A,
          "insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts) values ($1,'2026-06-13',1,1,0)",
          [USER_A],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await client.query("rollback");
    }
  });

  it("net_worth_snapshots: owner SELECTs its rows; another tenant sees none", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      // Service-role (table owner) write — the daily job's path.
      await client.query(
        "insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts) values ($1,'2026-06-13',24600,31820,7220)",
        [USER_A],
      );
      const owner = await asUser(USER_A, "select count(*)::int as n from net_worth_snapshots where user_id=$1", [USER_A]);
      expect(owner.rows[0].n).toBe(1);
      const other = await asUser(USER_B, "select count(*)::int as n from net_worth_snapshots where user_id=$1", [USER_A]);
      expect(other.rows[0].n).toBe(0);
    } finally {
      await client.query("rollback");
    }
  });

  it("net_worth_snapshots: one sample per (user, day) — the daily job is idempotent", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      // The job's path: upsert on-conflict-do-nothing. A second sample the same
      // day is a no-op — exactly one row, the first sample wins.
      await client.query(
        "insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts) values ($1,'2026-06-13',100,100,0) on conflict (user_id, captured_on) do nothing",
        [USER_A],
      );
      await client.query(
        "insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts) values ($1,'2026-06-13',999,999,0) on conflict (user_id, captured_on) do nothing",
        [USER_A],
      );
      const n = await client.query("select count(*)::int as n, max(net_worth) as v from net_worth_snapshots where user_id=$1", [
        USER_A,
      ]);
      expect(n.rows[0].n).toBe(1);
      expect(Number(n.rows[0].v)).toBe(100);

      // The unique key also rejects a RAW duplicate (savepoint so the aborted
      // sub-statement doesn't poison the outer transaction).
      await client.query("savepoint sp");
      await expect(
        client.query(
          "insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts) values ($1,'2026-06-13',999,999,0)",
          [USER_A],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
      await client.query("rollback to savepoint sp");
    } finally {
      await client.query("rollback");
    }
  });

  // ── complete_recap_action: atomic + weekly-idempotent ──
  it("recap action: commits run+config atomically; same week = no-op; next week = new run", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      const wfId = await seedActiveWorkflow(USER_A);

      // First call this week: a new run + config.target updated.
      const r1 = await asUser(USER_A, "select complete_recap_action($1, 30000, 'recap_raise_target', '2026-W24') as r", [
        wfId,
      ]);
      expect(r1.rows[0].r).toMatchObject({ ok: true, noop: false });
      const runs1 = await client.query("select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runs1.rows[0].n).toBe(1);
      const cfg = await client.query("select (config->>'target')::numeric as t from workflows where id=$1", [wfId]);
      expect(Number(cfg.rows[0].t)).toBe(30000);

      // Same period again: idempotent no-op (ok, noop:true) — no second run.
      const r2 = await asUser(USER_A, "select complete_recap_action($1, 31000, 'recap_raise_target', '2026-W24') as r", [
        wfId,
      ]);
      expect(r2.rows[0].r).toMatchObject({ ok: true, noop: true });
      const runs2 = await client.query("select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runs2.rows[0].n).toBe(1); // still one
      const cfg2 = await client.query("select (config->>'target')::numeric as t from workflows where id=$1", [wfId]);
      expect(Number(cfg2.rows[0].t)).toBe(30000); // unchanged this week

      // Next ISO week: a fresh run is allowed (WAWU is weekly-repeatable).
      const r3 = await asUser(USER_A, "select complete_recap_action($1, 32000, 'recap_raise_target', '2026-W25') as r", [
        wfId,
      ]);
      expect(r3.rows[0].r).toMatchObject({ ok: true, noop: false });
      const runs3 = await client.query("select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runs3.rows[0].n).toBe(2);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("recap action: the once-ever target_set guard still holds (period null)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      const wfId = await seedActiveWorkflow(USER_A);
      await asUser(
        USER_A,
        "insert into workflow_runs (user_id, workflow_id, kind) values ($1,$2,'target_set')",
        [USER_A, wfId],
      );
      // A second once-ever target_set (period null) is still rejected by the
      // re-scoped partial unique index — the onboarding guard is intact.
      await expect(
        asUser(USER_A, "insert into workflow_runs (user_id, workflow_id, kind) values ($1,$2,'target_set')", [USER_A, wfId]),
      ).rejects.toThrow(/duplicate key|unique/i);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("recap action: cross-tenant is invalid (SECURITY INVOKER + RLS)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const wfB = await seedActiveWorkflow(USER_B);
      // USER_A cannot act on USER_B's workflow — it's invisible → invalid.
      const cross = await asUser(USER_A, "select complete_recap_action($1, 99999, 'recap_raise_target', '2026-W24') as r", [
        wfB,
      ]);
      expect(cross.rows[0].r).toMatchObject({ ok: false, error: "invalid" });
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  // ── metrics_return_weekly ──
  it("metrics_return_weekly: distinct returners per week; authenticated cannot read it", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      // Two distinct users view the recap in the same isolated fixture week; a
      // repeat view by USER_A must not double-count.
      await client.query(
        "insert into auth_funnel_events (user_id, event, occurred_at) values ($1,'recap_viewed','2020-02-03T10:00:00Z'),($1,'recap_viewed','2020-02-03T18:00:00Z'),($2,'recap_viewed','2020-02-04T09:00:00Z')",
        [USER_A, USER_B],
      );
      const row = await client.query("select returners from metrics_return_weekly where week_start='2020-02-03'");
      expect(Number(row.rows[0].returners)).toBe(2);

      // Revoke boundary: authenticated cannot read the view (PostgREST leak closed).
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USER_A, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      await expect(client.query("select * from metrics_return_weekly")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

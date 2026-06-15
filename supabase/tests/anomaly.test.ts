import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// WLT-18 — the anomaly engine's data model under a REAL Postgres (SUPABASE_DB_URL).
// Skipped when the env is absent. Covers:
//   * anomalies — financial-table INSERT (service-role only), owner-SELECT,
//     cross-tenant deny, and owner-UPDATE limited to `status` (the trigger).
//   * complete_anomaly_review — atomic status→acted + one recap_review_anomaly run
//     per anomaly (0008 period index), replay no-op, cross-tenant invalid.
//   * metrics_anomaly_weekly — status counts + the revoke boundary.

const DB_URL = process.env.SUPABASE_DB_URL;
const suite = DB_URL ? describe : describe.skip;

const USER_A = "e1111111-1111-1111-1111-111111111111";
const USER_B = "e2222222-2222-2222-2222-222222222222";

suite("anomaly RLS + review (WLT-18)", () => {
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

  async function seedAnomaly(uid: string, dedup = "large_charge:t1"): Promise<string> {
    const r = await client.query(
      `insert into anomalies (user_id, kind, severity, summary, detected_on, dedup_key)
       values ($1,'large_charge','attention','{"amount":480,"category":"Groceries"}'::jsonb,'2026-06-14',$2)
       returning id`,
      [uid, dedup],
    );
    return r.rows[0].id;
  }

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
       values ($1,$2,'networth_snapshot','active','{"netWorth":24000,"target":30000}'::jsonb) returning id`,
      [uid, g.rows[0].id],
    );
    return w.rows[0].id;
  }

  it("anomalies: authenticated cannot INSERT (service-role only)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      await expect(
        asUser(
          USER_A,
          "insert into anomalies (user_id, kind, severity, summary, detected_on, dedup_key) values ($1,'low_balance','attention','{}'::jsonb,'2026-06-14','x')",
          [USER_A],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await client.query("rollback");
    }
  });

  it("anomalies: owner SELECTs its own; another tenant sees none; UPDATE is status-ONLY", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const id = await seedAnomaly(USER_A);

      const owner = await asUser(USER_A, "select count(*)::int as n from anomalies where id=$1", [id]);
      expect(owner.rows[0].n).toBe(1);
      const other = await asUser(USER_B, "select count(*)::int as n from anomalies where id=$1", [id]);
      expect(other.rows[0].n).toBe(0);

      // owner MAY change status…
      const ok = await asUser(USER_A, "update anomalies set status='dismissed' where id=$1", [id]);
      expect(ok.rowCount).toBe(1);

      // …but NOT any other column (the status-only trigger raises). Each
      // expected failure aborts the tx, so wrap in a savepoint to keep going.
      await asUser(USER_A, "update anomalies set status='open' where id=$1", [id]); // reset
      await client.query("savepoint sp_kind");
      await expect(asUser(USER_A, "update anomalies set kind='low_balance' where id=$1", [id])).rejects.toThrow(
        /only status may be updated/i,
      );
      await client.query("rollback to savepoint sp_kind");
      await client.query("savepoint sp_summary");
      await expect(
        asUser(USER_A, `update anomalies set summary='{"amount":1}'::jsonb where id=$1`, [id]),
      ).rejects.toThrow(/only status may be updated/i);
      await client.query("rollback to savepoint sp_summary");

      // cross-tenant update matches 0 rows
      const cross = await asUser(USER_B, "update anomalies set status='dismissed' where id=$1", [id]);
      expect(cross.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("complete_anomaly_review: atomic status→acted + one run per anomaly; replay no-op; cross-tenant invalid", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const wfId = await seedActiveWorkflow(USER_A);
      const anId = await seedAnomaly(USER_A);

      // Review: status→acted AND a recap_review_anomaly run (period = anomaly id).
      const r1 = await asUser(USER_A, "select complete_anomaly_review($1,$2) as r", [anId, wfId]);
      expect(r1.rows[0].r).toMatchObject({ ok: true, noop: false });
      const st = await client.query("select status from anomalies where id=$1", [anId]);
      expect(st.rows[0].status).toBe("acted");
      const runs = await client.query(
        "select kind, period from workflow_runs where workflow_id=$1 and kind='recap_review_anomaly'",
        [wfId],
      );
      expect(runs.rows).toEqual([{ kind: "recap_review_anomaly", period: anId }]);

      // Replay (already acted): idempotent no-op, still one run.
      const r2 = await asUser(USER_A, "select complete_anomaly_review($1,$2) as r", [anId, wfId]);
      expect(r2.rows[0].r).toMatchObject({ ok: false, error: "invalid" }); // not open/surfaced anymore
      const runs2 = await client.query(
        "select count(*)::int as n from workflow_runs where workflow_id=$1 and kind='recap_review_anomaly'",
        [wfId],
      );
      expect(runs2.rows[0].n).toBe(1);

      // Cross-tenant: USER_B can't review USER_A's anomaly (invisible → invalid).
      const anB = await seedAnomaly(USER_A, "large_charge:t2");
      const wfB = await seedActiveWorkflow(USER_B);
      const cross = await asUser(USER_B, "select complete_anomaly_review($1,$2) as r", [anB, wfB]);
      expect(cross.rows[0].r).toMatchObject({ ok: false, error: "invalid" });
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("metrics_anomaly_weekly: status counts; authenticated cannot read it", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      // detected today; flip one to dismissed, one stays open.
      const a1 = await seedAnomaly(USER_A, "k1");
      await seedAnomaly(USER_A, "k2");
      await client.query("update anomalies set status='dismissed' where id=$1", [a1]);

      const wk = await client.query(
        "select detected, dismissed from metrics_anomaly_weekly where week_start = date_trunc('week', now())::date",
      );
      expect(Number(wk.rows[0].detected)).toBeGreaterThanOrEqual(2);
      expect(Number(wk.rows[0].dismissed)).toBeGreaterThanOrEqual(1);

      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USER_A, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      await expect(client.query("select * from metrics_anomaly_weekly")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

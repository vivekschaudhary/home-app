import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// WLT-13 — the 0007 metric views: math verified against seeded fixture events
// (AC11) + the privilege posture (AC1: SELECT revoked from authenticated — the
// views bypass base-table RLS, so the revoke IS the security boundary).
// The shared DB may hold real events, so GLOBAL aggregates are asserted as
// DELTAS; per-user rows and an isolated fixture week (2020) are asserted EXACTLY.

const DB_URL = process.env.SUPABASE_DB_URL;
const suite = DB_URL ? describe : describe.skip;

const U1 = "c1111111-1111-1111-1111-111111111111";
const U2 = "c2222222-2222-2222-2222-222222222222";

suite("metric views (WLT-13): math + privileges", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });

  /** Seed a full funnel for a user starting at `t0` (ISO), with offsets in seconds. */
  async function seedFunnel(uid: string, t0: string, offsets: Record<string, number>) {
    for (const [event, sec] of Object.entries(offsets)) {
      await client.query(
        "insert into auth_funnel_events (user_id, event, occurred_at) values ($1, $2, $3::timestamptz + make_interval(secs => $4))",
        [uid, event, t0, sec],
      );
    }
  }

  it("computes per-user TTFV + splits exactly; summary/funnel move by the seeded deltas; WAWU isolates the fixture week", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [U1, U2]);

      const before = (await client.query("select * from metrics_ttfv_summary")).rows[0];
      const beforeAction = (
        await client.query("select users from metrics_funnel_stages where stage='action_completed'")
      ).rows[0];

      // U1: the full loop in 150s (signup → … → action), splits at 60s / 100s.
      // A REPEAT action at +500s must not skew anything (first-occurrence rule).
      await seedFunnel(U1, "2020-01-06T10:00:00Z", {
        signup_started: 0,
        mfa_enrolled: 30,
        account_linked: 60,
        intent_declared: 40,
        workflow_assembled: 100,
        action_completed: 150,
      });
      await client.query(
        "insert into auth_funnel_events (user_id, event, occurred_at) values ($1,'action_completed','2020-01-06T10:08:20Z')",
        [U1],
      );
      // U2: signs up + links but never completes — counts as a signup, not a TTFV.
      await seedFunnel(U2, "2020-01-06T11:00:00Z", { signup_started: 0, account_linked: 90 });

      // EXACT per-user math (the clock + splits).
      const u1 = (
        await client.query(
          "select ttfv_seconds, split_linked_seconds, split_assembled_seconds from metrics_ttfv_per_user where user_id=$1",
          [U1],
        )
      ).rows[0];
      expect(Number(u1.ttfv_seconds)).toBe(150);
      expect(Number(u1.split_linked_seconds)).toBe(60);
      expect(Number(u1.split_assembled_seconds)).toBe(100);
      const u2 = (
        await client.query("select ttfv_seconds from metrics_ttfv_per_user where user_id=$1", [U2])
      ).rows[0];
      expect(u2.ttfv_seconds).toBeNull(); // incomplete loop → no TTFV, still a signup

      // DELTA on the global summary: +2 signups, +1 completed.
      const after = (await client.query("select * from metrics_ttfv_summary")).rows[0];
      expect(Number(after.n_signups) - Number(before.n_signups)).toBe(2);
      expect(Number(after.n_completed) - Number(before.n_completed)).toBe(1);

      // EXACT WAWU for the isolated 2020 fixture week: 1 distinct user (the
      // repeat action neither adds a user nor a week).
      const wawu = (
        await client.query("select wawu from metrics_wawu_weekly where week_start = '2020-01-06'")
      ).rows[0];
      expect(Number(wawu.wawu)).toBe(1);

      // DELTA on the funnel's action stage: +1 user (not +2 — first-occurrence).
      const afterAction = (
        await client.query("select users from metrics_funnel_stages where stage='action_completed'")
      ).rows[0];
      expect(Number(afterAction.users) - Number(beforeAction.users)).toBe(1);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("PRIVILEGES: authenticated cannot read the views (revoked — the PostgREST leak is closed)", async () => {
    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: U1, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      await expect(client.query("select * from metrics_ttfv_summary")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

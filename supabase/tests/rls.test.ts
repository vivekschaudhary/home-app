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

// Financial-table posture (WLT-2 + the passkey audit): owner-SELECT only; ALL
// writes via the service role. An authenticated user must NEVER write a financial
// row directly — RLS denies the insert before any FK/constraint check.
suite("financial-table RLS (WLT-2): service-role writes only", () => {
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
    await client.query("reset role"); // skipped on throw — the outer rollback resets
    return res;
  }

  const writes: Array<{ table: string; sql: string }> = [
    {
      table: "account_connections",
      sql: "insert into account_connections (user_id, provider, provider_connection_id, vault_token_ref) values ($1,'plaid','item_x',gen_random_uuid())",
    },
    {
      table: "financial_accounts",
      sql: "insert into financial_accounts (user_id, name, kind) values ($1,'Checking','depository')",
    },
    {
      table: "transactions",
      sql: "insert into transactions (user_id, account_id, source, dedup_key, content_hash, amount, direction, description, occurred_on) values ($1, gen_random_uuid(), 'plaid','dk','ch','1.00','debit','x','2026-06-01')",
    },
  ];

  for (const { table, sql } of writes) {
    it(`an authenticated user cannot INSERT into ${table} (RLS denies)`, async () => {
      await client.query("begin");
      try {
        await expect(asUser(USER_A, sql, [USER_A])).rejects.toThrow(/row-level security/i);
      } finally {
        await client.query("rollback");
      }
    });
  }

  it("owner SELECTs its rows; another tenant sees none; soft-deleted rows are hidden", async () => {
    await client.query("begin");
    try {
      // Seed as the table owner (service role). auth.users needs only `id`.
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [
        USER_A,
        USER_B,
      ]);
      const ins = await client.query(
        "insert into account_connections (user_id, provider, provider_connection_id, vault_token_ref) values ($1,'plaid','item_owner',gen_random_uuid()) returning id",
        [USER_A],
      );
      const id = ins.rows[0].id;

      const owner = await asUser(USER_A, "select count(*)::int as n from account_connections where id=$1", [id]);
      expect(owner.rows[0].n).toBe(1); // owner reads its own row

      const other = await asUser(USER_B, "select count(*)::int as n from account_connections where id=$1", [id]);
      expect(other.rows[0].n).toBe(0); // cross-tenant denied

      await client.query("update account_connections set deleted_at = now() where id=$1", [id]);
      const afterDelete = await asUser(USER_A, "select count(*)::int as n from account_connections where id=$1", [id]);
      expect(afterDelete.rows[0].n).toBe(0); // soft-deleted rows filtered by the policy
    } finally {
      await client.query("rollback");
    }
  });
});

// Intent/Goal posture (WLT-3): OWNER CRUD — unlike the financial tables, the user
// writes their own intent directly (insert_own with-check). Cross-tenant writes
// are still denied, and soft-deleted rows are hidden.
suite("intent RLS (WLT-3): owner CRUD", () => {
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

  it("owner inserts + reads its own intent; cross-tenant insert denied; cross-tenant read = 0; soft-delete hidden", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);

      // owner CAN insert their own intent (insert_own with-check)
      const ins = await asUser(
        USER_A,
        "insert into intents (user_id, cluster, intent_key, label) values ($1,'goal','goal_save_specific','Save for something specific') returning id",
        [USER_A],
      );
      const id = ins.rows[0].id;

      const owner = await asUser(USER_A, "select count(*)::int as n from intents where id=$1", [id]);
      expect(owner.rows[0].n).toBe(1);

      const other = await asUser(USER_B, "select count(*)::int as n from intents where id=$1", [id]);
      expect(other.rows[0].n).toBe(0);

      // goals (same owner-CRUD posture — AC6 covers BOTH intents + goals): owner
      // inserts + reads its own derived goal; another tenant sees none.
      await asUser(USER_A, "insert into goals (user_id, intent_id, kind) values ($1,$2,'save_specific')", [USER_A, id]);
      const goalOwner = await asUser(USER_A, "select count(*)::int as n from goals where intent_id=$1", [id]);
      expect(goalOwner.rows[0].n).toBe(1);
      const goalOther = await asUser(USER_B, "select count(*)::int as n from goals where intent_id=$1", [id]);
      expect(goalOther.rows[0].n).toBe(0);

      // Owner UPDATE via the authenticated RLS path (AC6 owner-CRUD): the owner
      // can update their own intent/goal; a cross-tenant update matches 0 rows
      // (the row is invisible to the UPDATE's USING clause for another user).
      const updIntent = await asUser(USER_A, "update intents set label='updated' where id=$1", [id]);
      expect(updIntent.rowCount).toBe(1);
      const crossIntent = await asUser(USER_B, "update intents set label='hacked' where id=$1", [id]);
      expect(crossIntent.rowCount).toBe(0);
      const updGoal = await asUser(USER_A, "update goals set status='active' where intent_id=$1", [id]);
      expect(updGoal.rowCount).toBe(1);
      const crossGoal = await asUser(USER_B, "update goals set status='archived' where intent_id=$1", [id]);
      expect(crossGoal.rowCount).toBe(0);

      // Soft-delete via service role (the user-driven soft-delete-via-RLS path —
      // setting deleted_at moves the row out of one's own SELECT visibility, a
      // Postgres WITH-CHECK quirk — is deferred to the intent-management slice;
      // WLT-11 has no user-delete UI). The guarantee here: soft-deleted rows are
      // hidden from the owner's SELECT.
      await client.query("update intents set deleted_at = now() where id=$1", [id]);
      const afterDelete = await asUser(USER_A, "select count(*)::int as n from intents where id=$1", [id]);
      expect(afterDelete.rows[0].n).toBe(0);

      // LAST — a failed statement aborts the tx, so the cross-tenant-insert denial
      // (WITH CHECK) goes after the assertions above. A user can't insert a row
      // owned by someone else.
      await expect(
        asUser(
          USER_B,
          "insert into intents (user_id, cluster, intent_key, label) values ($1,'fear','fear_overspending','x')",
          [USER_A],
        ),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000); // many sequential round-trips to the remote DB

  it("blocks a forged cross-tenant goal→intent link (composite FK)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const ins = await client.query(
        "insert into intents (user_id,cluster,intent_key,label) values ($1,'goal','goal_save_specific','x') returning id",
        [USER_A],
      );
      const foreignIntentId = ins.rows[0].id;
      // USER_B owns the goal (passes the user_id WITH CHECK) but points it at
      // USER_A's intent — the composite FK (intent_id, user_id)→intents(id, user_id)
      // rejects it at the DB boundary.
      await expect(
        asUser(USER_B, "insert into goals (user_id, intent_id, kind) values ($1,$2,'x')", [USER_B, foreignIntentId]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

// Workflow engine posture (WLT-4/WLT-12): workflows = owner CRUD (like goals);
// workflow_runs = owner SELECT+INSERT ONLY (immutable action record — no
// update/delete policies exist). Composite same-user FKs block forged
// cross-tenant goal→workflow and workflow→run links at the DB boundary.
suite("workflow RLS (WLT-12): owner CRUD + immutable runs + composite FKs", () => {
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
  /** Seed an intent+goal for a user (service path) and return the goal id. */
  async function seedGoal(uid: string): Promise<string> {
    const i = await client.query(
      "insert into intents (user_id,cluster,intent_key,label) values ($1,'control','control_one_place','x') returning id",
      [uid],
    );
    const g = await client.query(
      "insert into goals (user_id,intent_id,kind) values ($1,$2,'unified_view') returning id",
      [uid, i.rows[0].id],
    );
    return g.rows[0].id;
  }

  it("owner CRUD on workflows; cross-tenant read/update = 0; runs are owner-visible only", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const goalId = await seedGoal(USER_A);

      // owner inserts + reads their own workflow
      const ins = await asUser(
        USER_A,
        "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot') returning id",
        [USER_A, goalId],
      );
      const wfId = ins.rows[0].id;
      const owner = await asUser(USER_A, "select count(*)::int as n from workflows where id=$1", [wfId]);
      expect(owner.rows[0].n).toBe(1);

      // cross-tenant: invisible to read + update matches 0 rows
      const other = await asUser(USER_B, "select count(*)::int as n from workflows where id=$1", [wfId]);
      expect(other.rows[0].n).toBe(0);
      const crossUpd = await asUser(USER_B, "update workflows set status='archived' where id=$1", [wfId]);
      expect(crossUpd.rowCount).toBe(0);

      // owner advances it (personalize): update own row OK
      const upd = await asUser(
        USER_A,
        `update workflows set status='active', config='{"netWorth":1}'::jsonb where id=$1`,
        [wfId],
      );
      expect(upd.rowCount).toBe(1);

      // owner records the action (immutable run) + reads it; other tenant sees 0
      await asUser(
        USER_A,
        `insert into workflow_runs (user_id, workflow_id, kind, context) values ($1,$2,'target_set','{"target":500}'::jsonb)`,
        [USER_A, wfId],
      );
      const runOwner = await asUser(USER_A, "select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runOwner.rows[0].n).toBe(1);
      const runOther = await asUser(USER_B, "select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runOther.rows[0].n).toBe(0);

      // IMMUTABLE: even the OWNER cannot update or delete a run (no policies →
      // UPDATE/DELETE match 0 rows under RLS; not an error, just no effect).
      const runUpd = await asUser(USER_A, "update workflow_runs set kind='tampered' where workflow_id=$1", [wfId]);
      expect(runUpd.rowCount).toBe(0);
      const runDel = await asUser(USER_A, "delete from workflow_runs where workflow_id=$1", [wfId]);
      expect(runDel.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("blocks a forged cross-tenant goal→workflow link (composite FK)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const foreignGoalId = await seedGoal(USER_A);
      // USER_B owns the workflow row but points it at USER_A's goal — the
      // composite FK (goal_id, user_id)→goals(id, user_id) rejects it.
      await expect(
        asUser(USER_B, "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot')", [
          USER_B,
          foreignGoalId,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("blocks a forged cross-tenant workflow→run link (composite FK)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const goalId = await seedGoal(USER_A);
      const wf = await client.query(
        "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot') returning id",
        [USER_A, goalId],
      );
      // USER_B "completes an action" against USER_A's workflow — rejected.
      await expect(
        asUser(USER_B, "insert into workflow_runs (user_id, workflow_id, kind) values ($1,$2,'target_set')", [
          USER_B,
          wf.rows[0].id,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("complete_workflow_action (atomic RPC): owner commits run+config together; replay invalid; cross-tenant invalid", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);
      const goalId = await seedGoal(USER_A);
      const wf = await client.query(
        `insert into workflows (user_id, goal_id, archetype, status, config)
         values ($1,$2,'networth_snapshot','active','{"netWorth":100}'::jsonb) returning id`,
        [USER_A, goalId],
      );
      const wfId = wf.rows[0].id;

      // Owner: atomic success — run inserted AND config.target set, together.
      const ok = await asUser(USER_A, "select complete_workflow_action($1, 500) as r", [wfId]);
      expect(ok.rows[0].r.ok).toBe(true);
      const run = await client.query("select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(run.rows[0].n).toBe(1);
      const cfg = await client.query("select (config->>'target')::numeric as t from workflows where id=$1", [wfId]);
      expect(Number(cfg.rows[0].t)).toBe(500);

      // Replay: invalid — no second run, target unchanged.
      const replay = await asUser(USER_A, "select complete_workflow_action($1, 999) as r", [wfId]);
      expect(replay.rows[0].r).toEqual({ ok: false, error: "invalid" });
      const runAfter = await client.query("select count(*)::int as n from workflow_runs where workflow_id=$1", [wfId]);
      expect(runAfter.rows[0].n).toBe(1);

      // Cross-tenant: SECURITY INVOKER + RLS → USER_B can't even see it → invalid.
      const goalB = await seedGoal(USER_B);
      const wfB = await client.query(
        `insert into workflows (user_id, goal_id, archetype, status, config)
         values ($1,$2,'networth_snapshot','active','{}'::jsonb) returning id`,
        [USER_B, goalB],
      );
      const cross = await asUser(USER_A, "select complete_workflow_action($1, 500) as r", [wfB.rows[0].id]);
      expect(cross.rows[0].r).toEqual({ ok: false, error: "invalid" });
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("REPLAY guard: one completed run per (workflow, kind) — duplicates rejected at the DB", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      const goalId = await seedGoal(USER_A);
      const wf = await client.query(
        "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot') returning id",
        [USER_A, goalId],
      );
      await asUser(USER_A, "insert into workflow_runs (user_id, workflow_id, kind) values ($1,$2,'target_set')", [
        USER_A,
        wf.rows[0].id,
      ]);
      // A replayed action cannot append a second immutable run (metrics integrity).
      await expect(
        asUser(USER_A, "insert into workflow_runs (user_id, workflow_id, kind) values ($1,$2,'target_set')", [
          USER_A,
          wf.rows[0].id,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("one live workflow per goal (idempotency index)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      const goalId = await seedGoal(USER_A);
      await asUser(USER_A, "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot')", [
        USER_A,
        goalId,
      ]);
      await expect(
        asUser(USER_A, "insert into workflows (user_id, goal_id, archetype) values ($1,$2,'networth_snapshot')", [
          USER_A,
          goalId,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

// Budgets posture (WLT-21): owner CRUD (like intents/goals — USER-declared
// config), NOT the financial-table service-role posture. The first user-WRITABLE
// financial-adjacent table → cross-tenant isolation is load-bearing (story AC12).
suite("budgets RLS (WLT-21): owner CRUD + cross-tenant deny", () => {
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

  it("owner sets + reads + updates + clears (hard-delete) own budget; cross-tenant denied", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1),($2) on conflict do nothing", [USER_A, USER_B]);

      const ins = await asUser(
        USER_A,
        "insert into budgets (user_id, category, limit_amount) values ($1,'FOOD_AND_DRINK',500) returning id",
        [USER_A],
      );
      const id = ins.rows[0].id;

      const owner = await asUser(USER_A, "select count(*)::int as n from budgets where id=$1", [id]);
      expect(owner.rows[0].n).toBe(1);
      const other = await asUser(USER_B, "select count(*)::int as n from budgets where id=$1", [id]);
      expect(other.rows[0].n).toBe(0);

      const upd = await asUser(USER_A, "update budgets set limit_amount=400 where id=$1", [id]);
      expect(upd.rowCount).toBe(1);
      const crossUpd = await asUser(USER_B, "update budgets set limit_amount=1 where id=$1", [id]);
      expect(crossUpd.rowCount).toBe(0);

      // Clear = the real clearBudgetForUser path: an authenticated owner DELETE.
      // A cross-tenant delete matches 0 rows (USING); the owner's removes the row.
      const crossDel = await asUser(USER_B, "delete from budgets where id=$1", [id]);
      expect(crossDel.rowCount).toBe(0);
      const del = await asUser(USER_A, "delete from budgets where id=$1", [id]);
      expect(del.rowCount).toBe(1);
      const afterClear = await asUser(USER_A, "select count(*)::int as n from budgets where id=$1", [id]);
      expect(afterClear.rows[0].n).toBe(0);

      // LAST — a failed statement aborts the tx: cross-tenant insert (WITH CHECK) denied.
      await expect(
        asUser(USER_B, "insert into budgets (user_id, category, limit_amount) values ($1,'TRAVEL',100)", [USER_A]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("enforces exactly-one-limit + active-per-category uniqueness", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);

      // both limits set → the CHECK ((amount is not null) <> (percent is not null)) rejects
      await expect(
        asUser(USER_A, "insert into budgets (user_id, category, limit_amount, limit_percent) values ($1,'TRAVEL',100,10)", [
          USER_A,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);

  it("a second active budget for the same category is rejected (partial unique index)", async () => {
    await client.query("begin");
    try {
      await client.query("insert into auth.users (id) values ($1) on conflict do nothing", [USER_A]);
      await asUser(USER_A, "insert into budgets (user_id, category, limit_amount) values ($1,'GROCERIES',300)", [USER_A]);
      await expect(
        asUser(USER_A, "insert into budgets (user_id, category, limit_percent) values ($1,'GROCERIES',20)", [USER_A]),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
    }
  }, 30_000);
});

#!/usr/bin/env node
// WLT-13 — write a metrics snapshot for the compass /measure workflow.
// Queries the SAME 0007 views the admin page renders and writes
// docs/metrics/WLT-5-<date>.json (stats + n + generated-at). Run manually or
// from /measure per the bet's weekly check_in_cadence:
//   SUPABASE_DB_URL=postgres://… node scripts/metrics-snapshot.mjs
// Honesty rule: every aggregate ships with its n; thin data is baselines, not
// verdicts (the brief's measurement guardrail).

import { writeFileSync } from "node:fs";
import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("metrics-snapshot: SUPABASE_DB_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
try {
  const ttfv = (await client.query("select * from metrics_ttfv_summary")).rows[0];
  const wawu = (await client.query("select * from metrics_wawu_weekly limit 12")).rows;
  const funnel = (await client.query("select * from metrics_funnel_stages order by stage_order")).rows;

  const snapshot = {
    bet: "WLT-5",
    generated_at: new Date().toISOString(),
    note: "Aggregates only — no PII. Thin n = baseline, not verdict.",
    ttfv: {
      clock: "signup_started -> action_completed (first occurrence per user)",
      target: "p80 <= 180s (KR1: <3 min for >=80% of new accounts)",
      n_completed: Number(ttfv.n_completed),
      n_signups: Number(ttfv.n_signups),
      p80_seconds: ttfv.p80_ttfv_seconds === null ? null : Number(ttfv.p80_ttfv_seconds),
      median_seconds: ttfv.median_ttfv_seconds === null ? null : Number(ttfv.median_ttfv_seconds),
      median_split_linked_seconds:
        ttfv.median_split_linked_seconds === null ? null : Number(ttfv.median_split_linked_seconds),
      median_split_assembled_seconds:
        ttfv.median_split_assembled_seconds === null ? null : Number(ttfv.median_split_assembled_seconds),
    },
    wawu_weekly: wawu.map((w) => ({ week_start: w.week_start, wawu: Number(w.wawu) })),
    funnel: funnel.map((s) => ({ stage: s.stage, users: Number(s.users) })),
  };

  const date = snapshot.generated_at.slice(0, 10);
  const path = `docs/metrics/WLT-5-${date}.json`;
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`metrics-snapshot: wrote ${path}`);
} finally {
  await client.end();
}

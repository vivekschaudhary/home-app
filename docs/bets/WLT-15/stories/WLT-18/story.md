---
id: WLT-18
bet: WLT-15
type: story
status: shipped
priority: P1
created: 2026-06-15
author: PM
design_link: docs/bets/WLT-15/stories/WLT-18/design.md
copy_link: docs/bets/WLT-15/stories/WLT-18/copy.md
area_tags: [frontend, backend, data, jobs, security]
dependencies:
  - WLT-16   # the recap surface + the one-action ranker this extends
  - WLT-17   # the humanizeCategory helper + the transactions read pattern
  - WLT-9    # the transactions the scan reads
---

# WLT-18 — Anomalies ("something worth your attention")

## Description

The recap's **fourth and final signal**, and the close-out of the WLT-15 bet: a **high-precision, dismissible** "worth a look" — an unusually large charge, a likely upcoming bill, or a low balance — surfaced from the user's real transactions and turned into the visit's **one prompted action** ("Review it" → a WAWU action). This is the **biggest-build, highest-trust** slice (the architecture's Slice 2): a new `anomalies` table (the already-modeled foundational `Anomaly` entity), a daily rules-based Inngest scan, and the recap integration that makes an open anomaly outrank the target action. On a financial app a *wrong* alert is worse than none, so the bar is **precision over recall**: conservative rules, always dismissible, never alarming, **no PII** (amount + humanized category + date only — never the merchant). Statistical detection is explicitly deferred; v1 is rules-based.

## Acceptance Criteria

- [ ] **AC1 — `anomalies` table (foundational `Anomaly` entity).** New migration: owner-**SELECT** + owner-**UPDATE limited to `status` only** + **service-role INSERT** (the scan); same-user **composite FK** `(account_id, user_id)`; a **`dedup_key`** unique per `(user_id, dedup_key)` so the scan is idempotent; `summary` jsonb carries **amounts/enums only — no PII** (no merchant/description). `status` ∈ `open|surfaced|acted|dismissed`; `kind` ∈ `large_charge|recurring_due|low_balance`; `severity` ∈ `info|attention`.
- [ ] **AC2 — High-precision rules (pure, `packages/core/anomaly.ts`).** `detectAnomalies(txns, baselines) → AnomalyCandidate[]` with **rules-based** detection only: **large_charge** (a debit ≫ the user's own trailing category baseline, conservative multiple), **recurring_due** (a regular charge likely due soon), **low_balance** (an account below a floor). Each rule is independently unit-tested to **fire on its fixture AND not false-positive on normal data**. Thresholds start conservative; tuning is an Engineer escalation (architecture I2). **No statistical/z-score detection this slice.**
- [ ] **AC3 — Daily scan job.** `anomalyScanDaily` Inngest cron (off the request path; fan-out over users with active connections, same pattern as `netWorthSnapshotDaily`) runs `detectAnomalies` over recent transactions and **INSERTs** new anomalies — **idempotent** on `dedup_key` (a re-scan never duplicates an existing anomaly). Registered in `packages/jobs/index.ts`.
- [ ] **AC4 — Recap surfaces the top open anomaly + it becomes the one action.** When ≥1 anomaly is `open`, the recap shows the **highest-severity** one as a plain "Worth a look" callout above movement, and the recap's single prompted action becomes **"Review it"** (outranking the WLT-16 target action). The `selectPromptedAction` ranker is extended: **anomaly > behind-target > on-track/ahead**. With no open anomaly, the recap is exactly the WLT-16/17 surface (no "all clear" banner).
- [ ] **AC5 — Review = the WAWU action; Dismiss = a quiet status change.** **Review it** → `PATCH /api/anomaly/:id` sets `status='acted'`, writes a **`WorkflowRun`** (`kind='recap_review_anomaly'`, period=the anomaly id → one run per anomaly) and emits **`action_completed`** (a real WAWU action). **Dismiss** → `status='dismissed'`, emits **`anomaly_dismissed`**, writes **no** WorkflowRun (dismissing isn't a financial action — the guardrail stays honest). Both are owner-only + status-only; an already-resolved anomaly is an idempotent no-op.
- [ ] **AC6 — Instrumentation.** New funnel events `anomaly_surfaced` (when the recap shows one) + `anomaly_dismissed`; `recap_review_anomaly` reuses `action_completed`. A `/admin/metrics` **anomaly panel** shows surfaced vs dismissed (a **dismiss-rate** = the precision proxy) so we can watch the trust guardrail.
- [ ] **AC7 — Plain, dismissible, no PII, owner-scoped.** Callout copy is informational ("Worth a look", never "Alert/fraud/suspicious"); amount + humanized category + date only (no merchant/description in the row, the surface, the event, or any log); always dismissible; reconcile-on-load; `RECAP_ENABLED`-gated. **Diff touches financial reads + a new write path + new public endpoint → mandatory Security Review.**

## Standard Experience Checklist

- [ ] **Navigation** — the callout lives on the `/dashboard` recap (no new route); Dismiss removes it, Review it → "noted" then the recap remains: **AC4/AC5** + design "Surfaces".
- [ ] **States** — open-anomaly / reviewed / dismissed / none-open / cold-start / error: **AC4, AC5** + design States table.
- [ ] **Feedback** — Review/Dismiss confirmations (`anomaly.acked` / `anomaly.dismissed`); errors discriminate network/save/server; Dismiss needs no confirm dialog (reversible-by-nature, resurfaces if still true): **AC5, AC7** + copy `anomalyErrors.*`.
- [ ] **Accessibility** — SR summary for the callout; severity/kind in words not color; focus to the "noted" line on review; keyboard-operable Review/Dismiss; `aria-live` on save; reduced-motion safe: design "Accessibility" + copy `anomalyA11y.*`.
- [ ] **Edge cases** — multiple open anomalies (highest-severity shown; next takes its place on dismiss); already-resolved (idempotent); scan-hasn't-run / no history (no callout); a dismissed anomaly that's still true (may resurface on a later scan — acceptable): **AC3, AC5** + design.
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1 (foundational Stack: deploy_targets [web])`.

## Tech notes

Build within the WLT-15 architecture — **no foundational-stack deviation** (the `Anomaly` entity is already in the Foundational Data Model; Postgres + Inngest + the funnel only). Mirrors the WLT-16 shapes.

- **Migration `0009_anomalies.sql`:** the `anomalies` table (RLS: owner-SELECT, owner-UPDATE `status`-only via a `with check`/column guard, service-role INSERT; composite FK; `unique (user_id, dedup_key)`); the `recap_review_anomaly` WorkflowRun kind reuses the WLT-16 `period` mechanism (period = anomaly id → one run per anomaly); a `metrics_anomaly_weekly` view (surfaced/dismissed counts; server-only revoke). Add events to `FUNNEL_EVENTS`.
- **Domain (`packages/core/anomaly.ts`, pure):** `detectAnomalies` + the three rules + `dedupKeyFor(candidate)`; reuse `humanizeCategory` (WLT-17). Pure → exhaustively unit-tested for precision.
- **Job (`packages/jobs/recap/anomaly-scan.ts`):** `anomalyScanDaily` cron; fan-out; idempotent insert; **register in `index.ts` (and remember the prod Inngest resync — see OPS-1).**
- **Recap integration:** extend `selectPromptedAction` (anomaly-aware) + `getRecap` (read open anomalies, emit `anomaly_surfaced`); a callout in `RecapCard`; `app/api/anomaly/[id]/route.ts` (PATCH status); a `complete_anomaly_review` atomic function (status update + WorkflowRun insert + `action_completed`) mirroring `complete_recap_action`.
- **Metrics:** extend `app/lib/metrics.ts` + the admin page with the anomaly panel.
- **Carry the lessons:** reconcile-on-load; no PII (summary/events amounts+enums only); owner-scoped; atomic review commit; **Security Review mandatory**.

## Dependencies
- **WLT-16** (recap surface + ranker + the `period`/atomic-action pattern this reuses).
- **WLT-17** (`humanizeCategory` + the transactions read).
- **Build gate:** `/build WLT-18` should start only after **WLT-17 is merged/shipped** (one-at-a-time discipline). This story is drafted ahead so Slice 2 is queued.

## PRs

- PR #51 — implementation (anomaly engine: table + 3 rules + scan + recap callout + review/dismiss + metrics) — **merged + shipped** 2026-06-15 (squash f6e831d). 3 review rounds (scope drift → recurring_due implemented strictly; missing real-path E2E → added; missing AC6 event assertions → added). Cross-model Codex **Approve** + Security **clean**. Prod deploy auto-registered `anomaly-scan-daily` in Inngest (OPS-1 auto-sync, proven live).

## Tests

_Engineer: unit (`detectAnomalies` per-rule fire + **no-false-positive on normal data**, `dedupKeyFor` stability, the anomaly-aware ranker order), live-PG (anomalies RLS: cross-tenant default-deny, owner-UPDATE status-only — cannot change other columns, service-role INSERT; the atomic review commit + one-run-per-anomaly idempotency; `metrics_anomaly_weekly` + revoke), component (callout states: open/reviewed/dismissed/none + the one-action invariant). Codex: real-path E2E — seed an anomaly → recap surfaces it → Review it → assert `acted` + a `workflow_runs` row + `action_completed`; Dismiss → `dismissed` + `anomaly_dismissed`, no run._

Tags:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-15] [Engineer] **All THREE rules ship — `large_charge` + `recurring_due` + `low_balance`** _(supersedes the initial deferral after Codex flagged it as contract drift vs AC2)_ — rationale: the deferral was driven by the false-positive risk of a *naive* recurring detector; the resolution is a **strict** one — `recurring_due` requires ≥3 occurrences, EVERY consecutive gap in a tight monthly band [26–35d], amounts within ±10%, and the predicted next charge due within the next 7 days. Strict regularity keeps precision high while honoring the AC — area: trust/scope — alternatives: amend AC2 to two rules (rejected — the AC is the contract; deliver it) / ship a naive detector (rejected — precision over recall) — reversibility: easy
- [2026-06-15] [Engineer] **status-only UPDATE enforced by a trigger, not column GRANTs** — rationale: the CI shim grants UPDATE on all columns (and re-grants after migrations), so a column-grant boundary wouldn't hold; the `anomalies_status_only` BEFORE-UPDATE trigger raises if any non-status column changes, regardless of grants — testable in live-PG — area: security — reversibility: easy
- [2026-06-15] [Engineer] **Review = atomic `complete_anomaly_review` (SECURITY INVOKER), one run per anomaly via the 0008 `period` index** — rationale: mirrors `complete_recap_action`; the status flip + the WAWU run commit together; period = anomaly id → exactly one `recap_review_anomaly` run per anomaly — area: data — reversibility: medium
- [2026-06-15] [Engineer] **anomaly outranks the target action in the surface (not in a shared ranker)** — rationale: `getRecap` returns both `anomaly` + `action`; the RecapCard shows the anomaly callout as the one action and suppresses the target button while it's open (at-most-one-prompted-action holds) — area: frontend — reversibility: easy
- [2026-06-15] [Engineer] **anomaly_surfaced emitted once per anomaly (open→surfaced transition in getRecap)** — rationale: makes the dismiss-rate metric per-anomaly (read off the table, not per-view events) — area: metrics — reversibility: easy
- [2026-06-15] [PM] **Final WLT-15 slice = the anomaly engine (detect → surface → review action)** — rationale: closes the four signals + the bet; the architecture's Slice 2 as one coherent unit — area: scope — alternatives: split detect-only from the action (rejected — the brief's value is anomaly→action; a display-only anomaly is half a feature) — reversibility: medium
- [2026-06-15] [PM] **Rules-based, high-precision, dismissible; statistical deferred** — rationale: a false alert on a financial app erodes the trust moat; precision over recall (brief guardrail) — area: trust — reversibility: medium
- [2026-06-15] [PM] **Review = WAWU action; Dismiss = quiet status change (no run)** — rationale: engaging is a real financial action, dismissing isn't; keeps WAWU honest + the at-most-one-prompted-action guardrail intact — area: metrics/trust — reversibility: easy
- [2026-06-15] [PM] **Anomaly outranks the target action** — rationale: a time-sensitive "worth a look" matters more this visit — area: UX — reversibility: easy

### Risks
- [2026-06-15] [PM] **False positives erode trust badly** — likelihood: medium — impact: high — mitigation: conservative rules, no statistical v1, always dismissible, plain framing, the dismiss-rate panel (AC6) as the precision watch — area: trust
- [2026-06-15] [PM] **Biggest WLT-15 build** (table + scan + ranker change + new write path + metrics) — likelihood: high — impact: medium — mitigation: it mirrors the WLT-16 shapes (period/atomic-action/cron) so most patterns are proven; could split detect-vs-action if it runs long — area: scope
- [2026-06-15] [Security] **New public endpoint + financial reads** — likelihood: low — impact: high — mitigation: owner+status-only PATCH, no PII, mandatory Security Review — area: security

### Issues
- [2026-06-15] [Reviewer→Engineer] **BLOCKER ×2 (PR #51)** — status: **resolved** — area: scope/testing — (1) *contract drift*: `recurring_due` was deferred while AC2 requires all three → implemented it strictly (high-precision) + 4 unit tests (fires on a clean monthly pattern; no false-positive on not-due/irregular/insufficient/varying). (2) *missing real-path anomaly E2E*: extended `e2e/recap.spec.ts` — seed anomaly → callout surfaces (outranks + suppresses the target action) → **Dismiss** (status→dismissed, persists across reload, no run) → seed another → **Review it** (status→acted + a `recap_review_anomaly` run), all through the real session→RSC→RLS path. Security review: **no findings**.
- [2026-06-15] [PM] **Inngest resync needed on deploy** (the new cron) — severity: medium — owner: Enterprise/Solution Architect — status: open — area: ops — until OPS-1's auto-sync is wired, `anomalyScanDaily` must be manually resynced in prod or it won't run (the exact failure OPS-1 documents).
- [2026-06-15] [PM] **Anomaly thresholds undecided** — severity: medium — owner: Engineer — status: open — area: data — start conservative; escalate threshold choices during `/build`.

---

_Story closed: <date>, brief link: docs/bets/WLT-15/brief.md_

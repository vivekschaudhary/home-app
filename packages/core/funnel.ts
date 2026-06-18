// Auth funnel event names — the CONTRACT WLT-5 adopts (story tech notes: "no
// rename later"). Feeds the TTFV clock + WAWU instrumentation. Stored in
// auth_funnel_events (server-side emitter only).
export const FUNNEL_EVENTS = {
  SIGNUP_STARTED: "signup_started",
  SIGNUP_CREDENTIALS_CREATED: "signup_credentials_created",
  MFA_ENROLL_STARTED: "mfa_enroll_started",
  MFA_ENROLLED: "mfa_enrolled",
  TOTP_ENROLL_STARTED: "totp_enroll_started",
  TOTP_ENROLLED: "totp_enrolled",
  SIGNIN_SUCCESS: "signin_success",
  // Aggregation (WLT-2) — ADDITIVE only (existing names + the table stay frozen
  // for WLT-5 per WLT-6's "no rename later"). WLT-5 owns the consolidated funnel.
  ACCOUNT_LINK_STARTED: "account_link_started",
  ACCOUNT_LINKED: "account_linked", // the bet's real-data-activation key_metric
  TRANSACTIONS_SYNCED: "sync_completed",
  ACCOUNT_DISCONNECTED: "account_disconnected",
  CONNECTION_ERROR: "connection_error",
  // Intent (WLT-3) — ADDITIVE; the intent→workflow conversion baseline (WLT-5).
  INTENT_DECLARED: "intent_declared",
  // Workflow engine (WLT-4) — ADDITIVE; intent→workflow→action funnel (WLT-5).
  WORKFLOW_ASSEMBLED: "workflow_assembled",
  ACTION_COMPLETED: "action_completed", // one WorkflowRun = the WAWU unit
  // Recap (WLT-15/WLT-16) — ADDITIVE; the return mechanic. recap_viewed = a
  // returning visit (Day-7 return metric); the recap action reuses
  // action_completed (so WAWU counts it, weekly-repeatable).
  RECAP_VIEWED: "recap_viewed",
  RECAP_ACTION_PROMPTED: "recap_action_prompted",
  // Anomalies (WLT-18) — surfaced once per anomaly (open→surfaced); dismissed on
  // the quiet escape. The "Review it" action reuses action_completed (WAWU).
  ANOMALY_SURFACED: "anomaly_surfaced",
  ANOMALY_DISMISSED: "anomaly_dismissed",
  // Budget (WLT-21) — ADDITIVE; the budget surface's engagement signal.
  // budget_viewed = a visit to /budget; budget_set / budget_cleared = the user
  // setting or removing a category cap (the "active budget engagement" metric).
  BUDGET_VIEWED: "budget_viewed",
  BUDGET_SET: "budget_set",
  BUDGET_CLEARED: "budget_cleared",
  // WLT-21-2 — a user expanded a category's 12-month year-spread (engagement).
  BUDGET_SPREAD_VIEWED: "budget_spread_viewed",
  // WLT-22-1 — a user drilled into a category to see its line items (verify/trust).
  CATEGORY_DRILLDOWN_VIEWED: "category_drilldown_viewed",
  // WLT-22-2 — a user corrected a transaction's category / created a category of
  // their own (the saved-category model; ownership + trust).
  TRANSACTION_RECATEGORIZED: "transaction_recategorized",
  CATEGORY_CREATED: "category_created",
} as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

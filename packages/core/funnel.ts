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
} as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

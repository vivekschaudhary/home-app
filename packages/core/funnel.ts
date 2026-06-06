// Auth funnel event names — the CONTRACT WLT-5 adopts (story tech notes: "no
// rename later"). Feeds the TTFV clock + WAWU instrumentation. Stored in
// auth_funnel_events (server-side emitter only).
export const FUNNEL_EVENTS = {
  SIGNUP_STARTED: "signup_started",
  SIGNUP_CREDENTIALS_CREATED: "signup_credentials_created",
  MFA_ENROLL_STARTED: "mfa_enroll_started",
  MFA_ENROLLED: "mfa_enrolled",
  SIGNIN_SUCCESS: "signin_success",
} as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

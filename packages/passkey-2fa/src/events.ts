// Auth lifecycle events emitted by the route handlers. Wire an `onEvent` handler
// (see ./routes) to plug in your own audit log, analytics, or funnel — the
// package stays free of any app-specific observability contract.

export type AuthEvent =
  | { type: "signup"; userId: string }
  | { type: "signin_failure" }
  | { type: "signin_success"; userId: string; method: "passkey" | "totp" }
  | { type: "mfa_enroll_started"; userId: string }
  | { type: "mfa_enrolled"; userId: string }
  | { type: "mfa_challenge_failure"; userId: string }
  | { type: "totp_enroll_started"; userId: string }
  | { type: "totp_enrolled"; userId: string }
  | { type: "totp_challenge_failure"; userId: string }
  | { type: "signout"; userId: string }
  // Password reset (WLT-14). `requested` carries no userId — anti-enumeration:
  // we never reveal (or even learn, on a miss) whose email it was.
  | { type: "password_reset_requested" }
  | { type: "password_reset_completed"; userId: string };

export type OnAuthEvent = (event: AuthEvent) => void | Promise<void>;

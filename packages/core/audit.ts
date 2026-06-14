// Audit actions — append-only AuditEvent trail (AC9). Server-side inserts only.
// context jsonb must NEVER contain PII (cross-cutting standards).
export const AUDIT_ACTIONS = {
  SIGNUP: "auth.signup",
  MFA_ENROLL: "auth.mfa.enroll",
  TOTP_ENROLL: "auth.totp.enroll",
  TOTP_CHALLENGE_FAILURE: "auth.totp.challenge.failure",
  SIGNIN_SUCCESS: "auth.signin.success",
  SIGNIN_FAILURE: "auth.signin.failure",
  MFA_CHALLENGE_FAILURE: "auth.mfa.challenge.failure",
  SIGNOUT: "auth.signout",
  // Password reset (WLT-14) — security-relevant; requested carries no user.
  PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
  // Aggregation (WLT-2)
  AGGREGATION_CONNECT: "aggregation.connect",
  AGGREGATION_DISCONNECT: "aggregation.disconnect",
  // Workflow engine (WLT-4) — every workflow action lands in the audit trail
  // (foundation L88: "workflow actions"; brief security mitigation).
  WORKFLOW_ASSEMBLE: "workflow.assemble",
  WORKFLOW_ACTION: "workflow.action",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

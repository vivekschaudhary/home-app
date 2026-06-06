// Audit actions — append-only AuditEvent trail (AC9). Server-side inserts only.
// context jsonb must NEVER contain PII (cross-cutting standards).
export const AUDIT_ACTIONS = {
  SIGNUP: "auth.signup",
  MFA_ENROLL: "auth.mfa.enroll",
  SIGNIN_SUCCESS: "auth.signin.success",
  SIGNIN_FAILURE: "auth.signin.failure",
  MFA_CHALLENGE_FAILURE: "auth.mfa.challenge.failure",
  SIGNOUT: "auth.signout",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

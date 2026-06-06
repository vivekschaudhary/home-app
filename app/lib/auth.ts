import { createPasskeyAuthHandlers, type AuthEvent } from "@vc1023/passkey-2fa/routes";
import { AUDIT_ACTIONS, FUNNEL_EVENTS } from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";

// Maps the package's generic auth lifecycle events onto this app's observability:
// the append-only AuditEvent trail (AC9) + the WLT-5 funnel contract (AC10).
async function onEvent(e: AuthEvent): Promise<void> {
  switch (e.type) {
    case "signup":
      await emitAudit(AUDIT_ACTIONS.SIGNUP, e.userId);
      await emitFunnel(FUNNEL_EVENTS.SIGNUP_CREDENTIALS_CREATED, e.userId);
      break;
    case "signin_failure":
      await emitAudit(AUDIT_ACTIONS.SIGNIN_FAILURE, null);
      break;
    case "signin_success":
      await emitAudit(AUDIT_ACTIONS.SIGNIN_SUCCESS, e.userId);
      await emitFunnel(FUNNEL_EVENTS.SIGNIN_SUCCESS, e.userId);
      break;
    case "mfa_enroll_started":
      await emitFunnel(FUNNEL_EVENTS.MFA_ENROLL_STARTED, e.userId);
      break;
    case "mfa_enrolled":
      await emitAudit(AUDIT_ACTIONS.MFA_ENROLL, e.userId);
      await emitFunnel(FUNNEL_EVENTS.MFA_ENROLLED, e.userId);
      break;
    case "mfa_challenge_failure":
      await emitAudit(AUDIT_ACTIONS.MFA_CHALLENGE_FAILURE, e.userId);
      break;
    case "signout":
      await emitAudit(AUDIT_ACTIONS.SIGNOUT, e.userId);
      break;
  }
}

export const handlers = createPasskeyAuthHandlers({ onEvent });

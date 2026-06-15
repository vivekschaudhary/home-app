import type { ApiErrorCode } from "./api-client";

/**
 * Map a Supabase `auth.signUp` error to a precise ApiErrorCode (SUP-8 — the
 * #40 / SUP-7 anti-pattern audit). signUp used to collapse EVERY failure to
 * `server`, so a stronger-password requirement or a rate limit looked like an
 * opaque server error. Discriminate the user-actionable, anti-enum-SAFE cases.
 *
 * Deliberately NOT discriminated: "email already registered". Revealing it would
 * make sign-up an account-enumeration side-channel — and sign-in + reset already
 * obfuscate (anti-enumeration posture). So an existing-email error stays `server`
 * (the common case is handled earlier by Supabase's obfuscated no-session path →
 * `email_confirmation_required`, not this error path).
 */
export function mapSignUpError(error: { code?: string; status?: number } | null | undefined): ApiErrorCode {
  if (!error) return "server";
  switch (error.code) {
    case "weak_password":
      return "validation_password"; // passed our ≥12 gate but Supabase wants stronger/non-breached
    case "over_request_rate_limit":
      return "rate_limited";
    default:
      if (error.status === 429) return "rate_limited";
      return "server"; // incl. email-already-registered → opaque (anti-enumeration)
  }
}

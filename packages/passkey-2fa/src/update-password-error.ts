import type { ApiErrorCode } from "./api-client";

/**
 * Map a Supabase `auth.updateUser({ password })` error to a precise ApiErrorCode
 * (SUP-7 — the #40 class, in the recovery handler).
 *
 * The reset handler used to collapse EVERY updateUser failure to a 502 `server`,
 * so a client-actionable rejection — most often the new password EQUALS the
 * current one (`same_password`), or Supabase won't accept it (`weak_password`:
 * length/breach/policy) — surfaced as an opaque server error with no path
 * forward. Discriminate by `error.code`; only a genuine, unrecognized failure
 * stays `server` (the only case that should 502).
 */
export function mapUpdatePasswordError(
  error: { code?: string; status?: number } | null | undefined,
): ApiErrorCode {
  if (!error) return "server"; // updateUser failed with no usable error → genuine server fault
  switch (error.code) {
    case "same_password":
      return "same_password"; // "that's already your password — pick a new one"
    case "weak_password":
      return "validation_password"; // Supabase rejected the password itself → choose a different one
    case "over_request_rate_limit":
      return "rate_limited";
    default:
      if (error.status === 429) return "rate_limited";
      return "server"; // a real, unrecognized failure — don't pretend it's actionable
  }
}

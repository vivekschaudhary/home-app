import type { ApiErrorCode } from "./api-client";

/**
 * Map a Supabase auth error to a precise ApiErrorCode (issue #40).
 *
 * The sign-in handler used to collapse EVERY failure to "invalid_credentials" —
 * so a rate-limit, an unconfirmed email, or a server/config error all told the
 * user "that email and password don't match," hiding the real cause and making
 * the message untrustworthy. Discriminate by Supabase's `error.code`. Critically:
 * a present-but-unexpected error must surface as `server`, NEVER as a false
 * "wrong password" — only a genuine credential rejection claims that.
 */
export function mapSignInError(error: { code?: string } | null | undefined): ApiErrorCode {
  if (!error) return "invalid_credentials"; // no error object but no user → genuinely bad creds
  switch (error.code) {
    case "email_not_confirmed":
      return "email_confirmation_required";
    case "invalid_credentials":
    case "invalid_grant":
      return "invalid_credentials";
    default:
      // A real, non-credential error (e.g. unexpected_failure, a config/Supabase
      // issue) — don't lie about a bad password. An error with no code at all
      // falls back to the conservative credential default.
      return error.code ? "server" : "invalid_credentials";
  }
}

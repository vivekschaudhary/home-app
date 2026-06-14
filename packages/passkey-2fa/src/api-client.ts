// Client-side POST helpers used by ./client. `postJSON` discriminates network
// vs server failures; `postForOptions` returns raw JSON for the WebAuthn options
// endpoints (which return the ceremony options object directly).

export type ApiErrorCode =
  | "validation_email"
  | "validation_password"
  | "invalid_credentials"
  | "email_confirmation_required"
  | "reset_link_invalid"
  | "network"
  | "server"
  | "unknown"
  | "verify"
  | "rate_limited"
  // Authenticator-app (TOTP) factor (WLT-7)
  | "invalid_code"
  | "expired_code"
  | "already_enrolled"
  | "aal2_required"
  | "last_factor"
  | "no_factor";

export interface ApiResult {
  ok: boolean;
  error?: ApiErrorCode;
  data?: unknown;
}

export async function postJSON(url: string, body?: unknown): Promise<ApiResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "network" };
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // non-JSON
  }

  if (res.ok && data.ok) return { ok: true, data };
  return { ok: false, error: (data.error as ApiErrorCode) ?? "server" };
}

/** POST returning the raw parsed JSON body on a 2xx, or null on failure. Used for
 *  the WebAuthn options endpoints (no `{ ok: true }` envelope). */
export async function postForOptions(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

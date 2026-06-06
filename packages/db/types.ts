// Row types for the WLT-6 auth tables (supabase/migrations/0002_auth_webauthn.sql).
// Hand-written for now; replace with `supabase gen types` output in a later bet.

export interface WebAuthnCredentialRow {
  id: string;
  user_id: string;
  credential_id: string; // base64url
  public_key: string; // base64url COSE key
  counter: number;
  transports: string[] | null;
  device_type: string | null;
  backed_up: boolean;
  aaguid: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebAuthnChallengeRow {
  id: string;
  user_id: string;
  challenge: string;
  type: "registration" | "authentication";
  expires_at: string;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  user_id: string | null;
  action: string;
  context: Record<string, unknown>;
  created_at: string;
}

export interface AuthFunnelEventRow {
  id: string;
  user_id: string | null;
  event: string;
  context: Record<string, unknown>;
  occurred_at: string;
}

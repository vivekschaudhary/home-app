// Row types for the package's WebAuthn tables
// (migrations/0001_passkey_tables.sql). Hand-written; replace with generated
// Supabase types in your app if you prefer.

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

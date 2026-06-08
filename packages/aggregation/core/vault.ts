// The token-store seam. Supabase Vault is the default impl
// (`@wealth/aggregation/vault`), but the interface is storage-agnostic — a KMS or
// HashiCorp Vault impl is a drop-in. The opaque `ref` is what lands in
// `account_connections.vault_token_ref`; the secret itself NEVER touches a table.

export interface TokenVault {
  /** Store a secret; returns the opaque ref to persist on the connection. */
  put(input: { secret: string }): Promise<{ ref: string }>;
  get(input: { ref: string }): Promise<string>;
  delete(input: { ref: string }): Promise<void>;
}

// Default TokenVault — Supabase Vault via the service-role `token_vault_*`
// wrappers (migration 0003). The secret only ever exists in Vault; tables hold
// the opaque ref. Swap this impl (KMS, pgsodium, HashiCorp) without touching any
// caller — the seam is the `TokenVault` interface.

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import type { TokenVault } from "../core/vault";

export function createSupabaseVault(): TokenVault {
  return {
    async put({ secret }) {
      const svc = createServiceSupabase();
      const { data, error } = await svc.rpc("token_vault_put", { p_secret: secret });
      if (error || data == null) throw new Error(`[vault] put failed: ${error?.message ?? "no ref returned"}`);
      return { ref: String(data) };
    },
    async get({ ref }) {
      const svc = createServiceSupabase();
      const { data, error } = await svc.rpc("token_vault_get", { p_ref: ref });
      if (error || data == null) throw new Error(`[vault] get failed: ${error?.message ?? "not found"}`);
      return String(data);
    },
    async delete({ ref }) {
      const svc = createServiceSupabase();
      const { error } = await svc.rpc("token_vault_delete", { p_ref: ref });
      if (error) throw new Error(`[vault] delete failed: ${error.message}`);
    },
  };
}

// @wealth/db — app observability writers (audit + funnel). Supabase clients +
// the WebAuthn schema/types now live in @vivekschaudhary/passkey-2fa; this
// package keeps only the app-specific audit/funnel emitters.
//   - emitters: import { emitAudit, emitFunnel } from "@wealth/db/emit"
export * from "./emit";

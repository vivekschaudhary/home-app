// @wealth/db — app observability writers (audit + funnel). Supabase clients +
// the WebAuthn schema/types now live in @vc1023/passkey-2fa; this
// package keeps only the app-specific audit/funnel emitters.
//   - emitters: import { emitAudit, emitFunnel } from "@wealth/db/emit"
//   - category assignments: import { readCategoryAssignments } from "@wealth/db/categories"
//   - paginated reads: import { readAllPaged } from "@wealth/db/paged"
export * from "./emit";
export * from "./categories";
export * from "./paged";

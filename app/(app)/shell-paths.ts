// WLT-20 — the auth-protected shell routes, PATHS ONLY (no React/icon imports)
// so this stays edge-bundle-safe. Imported by BOTH `middleware.ts` (the edge
// no-session gate) and `nav.ts` (consistency). A new section adds its path here
// so middleware protects it automatically — no drift (WLT-19 arch Issue).
export const SHELL_PATHS = [
  "/dashboard",
  "/accounts",
  "/budget",
  "/goals",
  "/debt",
  "/investments",
  "/subscriptions",
  "/transactions", // WLT-23-1 — the all-accounts ledger
  "/settings", // covers /settings/security (the account-menu surface)
] as const;

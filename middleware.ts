import { createPasskeyMiddleware } from "@vc1023/passkey-2fa/middleware";
import { SHELL_PATHS } from "@/app/(app)/shell-paths";

// WLT-20 — protect every app-shell route at the edge (no-session → /sign-in).
// SHELL_PATHS is the single source (shared with nav.ts) so a new section is
// auto-protected — no drift. AAL2 is enforced server-side (the (app) layout).
export const middleware = createPasskeyMiddleware({
  protectedPaths: [...SHELL_PATHS],
  signInPath: "/sign-in",
});

export const config = {
  // Run on everything except static assets + image optimizer.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

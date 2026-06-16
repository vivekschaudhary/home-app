import { getSessionUser, requireAal2 } from "@vc1023/passkey-2fa";
import { AppShell } from "./_components/AppShell";

// WLT-20 — the app-shell layout. The ONE place that wraps every shell route in
// the nav chrome AND gates AAL2: requireAal2() redirects to /sign-in unless the
// session is fully verified. Every (app) page ALSO calls requireAal2()
// (belt-and-suspenders for AC3 — no shell route renders without AAL2).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAal2();
  const user = await getSessionUser();
  return <AppShell email={user?.email}>{children}</AppShell>;
}

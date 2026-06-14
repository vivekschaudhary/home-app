import { redirect } from "next/navigation";
import { getSessionUser } from "@vc1023/passkey-2fa";
import { ResetFlow } from "./ResetFlow";

// WLT-14 — set a new password. The reset email links straight here (AC2:
// redirectTo = <prod>/reset). On the first hit the PKCE recovery `code` is
// present; we bounce it through the callback route to exchange it into a session
// (an RSC can't persist cookies) and return here clean. With a session →
// ResetFlow shows the form; without one (link missing/expired/used) → the honest
// expired state.
export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) {
    redirect(`/api/auth/callback?code=${encodeURIComponent(code)}&next=/reset`);
  }
  const user = await getSessionUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <ResetFlow hasSession={!!user} />
    </main>
  );
}

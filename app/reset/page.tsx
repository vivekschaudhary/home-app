import { getSessionUser } from "@vc1023/passkey-2fa";
import { ResetFlow } from "./ResetFlow";

// WLT-14 — set a new password. The callback exchanges the recovery code into a
// session before redirecting here; if there's no session (link missing/expired/
// used), ResetFlow shows the honest expired state.
export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const user = await getSessionUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <ResetFlow hasSession={!!user} />
    </main>
  );
}

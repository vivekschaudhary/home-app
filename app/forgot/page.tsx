import { ForgotFlow } from "./ForgotFlow";

// WLT-14 — request a password-reset link. Public (no auth): a locked-out user
// must be able to reach it.
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <ForgotFlow />
    </main>
  );
}

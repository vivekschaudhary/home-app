import Link from "next/link";
import { getSessionUser, requireAal2 } from "@vc1023/passkey-2fa";
import { SignOutButton } from "@/app/components/SignOutButton";
import { DashboardNudge } from "./DashboardNudge";

export const dynamic = "force-dynamic";

// Protected app shell. requireAal2() enforces the second factor server-side
// (AC2) — a session without a verified passkey is redirected to /sign-in.
export default async function DashboardPage() {
  await requireAal2();
  const user = await getSessionUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <header className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-lg font-semibold text-gray-900">Wealth at Your Fingertips</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings/security" className="text-sm font-medium text-gray-600 underline">
            Security
          </Link>
          <SignOutButton />
        </div>
      </header>
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">You&apos;re signed in.</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your account is protected with a passkey. Signed in as{" "}
          <span className="font-medium text-gray-900">{user?.email}</span>.
        </p>
        <DashboardNudge />
      </section>
    </main>
  );
}

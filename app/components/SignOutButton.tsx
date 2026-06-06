"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@vc1023/passkey-2fa/client";
import { COPY } from "@/app/lib/copy";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
      }}
      className={`text-sm font-medium text-gray-600 underline hover:text-gray-900 ${className}`}
    >
      {COPY.mfaEnroll.signout}
    </button>
  );
}

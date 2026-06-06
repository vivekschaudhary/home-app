"use client";

import { useRouter } from "next/navigation";
import { postJSON } from "@/app/lib/api-client";
import { COPY } from "@/app/lib/copy";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await postJSON("/api/auth/sign-out");
        router.push("/sign-in");
      }}
      className={`text-sm font-medium text-gray-600 underline hover:text-gray-900 ${className}`}
    >
      {COPY.mfaEnroll.signout}
    </button>
  );
}

import type { ReactNode } from "react";

/** Centered card layout for the auth surfaces. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}

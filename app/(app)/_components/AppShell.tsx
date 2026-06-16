"use client";

import { useState } from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { COPY } from "@/app/lib/copy";
import { MobileDrawer } from "./MobileDrawer";
import { Sidebar } from "./Sidebar";

// The responsive frame: a fixed sidebar at lg+, a top bar + hamburger drawer
// below lg, wrapping the page content. Owns the drawer open/closed state.
export function AppShell({ email, children }: { email?: string | null; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        {COPY.shell.skipToContent}
      </a>

      {/* desktop / tablet: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 lg:block">
        <Sidebar email={email} />
      </aside>

      {/* mobile: top bar with the hamburger */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={COPY.a11y.openNav}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
        >
          <Bars3Icon aria-hidden="true" className="h-6 w-6" />
        </button>
        <span className="text-sm font-semibold text-gray-900">{COPY.shell.brand}</span>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} email={email} />

      <main id="main-content" className="lg:pl-64">
        <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

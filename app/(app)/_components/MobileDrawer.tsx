"use client";

import { Dialog, DialogPanel } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { COPY } from "@/app/lib/copy";
import { Sidebar } from "./Sidebar";

// The mobile nav drawer (Headless UI Dialog): focus-trapped, aria-modal,
// closes on Esc + scrim click (Dialog's onClose), scroll-locked, and focus
// returns to the trigger on close. Reduced-motion: motion-safe gates the
// transitions, so they vanish under prefers-reduced-motion.
export function MobileDrawer({
  open,
  onClose,
  email,
}: {
  open: boolean;
  onClose: () => void;
  email?: string | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50 lg:hidden">
      <div className="fixed inset-0 bg-gray-900/40 motion-safe:transition-opacity" aria-hidden="true" />
      <div className="fixed inset-0 flex">
        <DialogPanel className="relative w-72 max-w-[80%] motion-safe:transition-transform">
          <button
            type="button"
            onClick={onClose}
            aria-label={COPY.a11y.closeNav}
            className="absolute right-2 top-2 z-10 rounded-md p-2 text-gray-500 hover:bg-gray-100"
          >
            <XMarkIcon aria-hidden="true" className="h-5 w-5" />
          </button>
          <Sidebar email={email} onNavigate={onClose} />
        </DialogPanel>
      </div>
    </Dialog>
  );
}

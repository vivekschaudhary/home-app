"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  /** ms before auto-dismiss; 0 = persist. Esc also dismisses. */
  durationMs?: number;
}

/** Success toast. aria-live=polite so screen readers announce it without
 *  stealing focus. */
export function Toast({ message, durationMs = 5000 }: ToastProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (durationMs > 0) {
      const t = setTimeout(() => setOpen(false), durationMs);
      return () => clearTimeout(t);
    }
  }, [durationMs]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}

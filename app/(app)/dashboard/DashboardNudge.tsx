"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFactors } from "@vc1023/passkey-2fa/client";
import { COPY } from "@/app/lib/copy";

const DISMISS_KEY = "wlt_nudge_totp_dismissed";

// Dismissible, skippable backup nudge (AC2). Shows only when the account has no
// authenticator factor and the user hasn't dismissed it before.
export function DashboardNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    let active = true;
    void getFactors().then((f) => {
      if (active && f && !f.totp) setShow(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4"
      role="region"
      aria-label={COPY.nudge.title}
    >
      <p className="text-sm font-medium text-amber-900">{COPY.nudge.title}</p>
      <p className="mt-1 text-sm text-amber-800">{COPY.nudge.body}</p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/settings/security" className="text-sm font-medium text-amber-900 underline">
          {COPY.nudge.cta}
        </Link>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setShow(false);
          }}
          className="text-sm font-medium text-amber-800 underline"
        >
          {COPY.nudge.dismiss}
        </button>
      </div>
    </div>
  );
}

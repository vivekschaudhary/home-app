"use client";

import { useState } from "react";

interface QrPanelProps {
  /** SVG data URI for the authenticator QR. */
  qrCode: string;
  /** base32 secret — the manual-entry key + the text equivalent of the QR. */
  secret: string;
  keyLabel: string; // copy: totp.enroll.manualKey.label
  copyLabel: string; // copy: totp.enroll.manualKey.copy
  copiedLabel: string; // copy: a11y.copyKey.done
}

/** Authenticator setup: the QR is decorative (alt=""); the selectable manual key
 *  below is the accessible / no-camera equivalent. */
export function QrPanel({ qrCode, secret, keyLabel, copyLabel, copiedLabel }: QrPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the key is selectable as a fallback
    }
  }

  return (
    <div className="space-y-3">
      {/* QR is a data-URI SVG (not a remote asset); next/image is inappropriate. */}
      <img src={qrCode} alt="" className="mx-auto h-44 w-44" />
      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-700">{keyLabel}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <code className="select-all break-all font-mono text-xs text-gray-900">{secret}</code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {copyLabel}
          </button>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? copiedLabel : ""}
        </span>
      </div>
    </div>
  );
}

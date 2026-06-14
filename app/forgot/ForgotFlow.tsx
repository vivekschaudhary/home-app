"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, Banner, Button, StepHeading, TextField } from "@wealth/ui";
import { requestPasswordReset } from "@vc1023/passkey-2fa/client";
import { COPY } from "@/app/lib/copy";

// WLT-14 — request a reset link. The "sent" confirmation is identical regardless
// of whether the email is registered (anti-enumeration is a UI property here too).
export function ForgotFlow() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) {
      // Only network / rate-limit / server reach here — the request itself never
      // discriminates on account existence.
      setError(
        res.error === "rate_limited"
          ? COPY.passwordErrors.rateLimited
          : res.error === "network"
            ? COPY.passwordErrors.network
            : COPY.passwordErrors.server,
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard>
        <StepHeading>{COPY.forgot.sentTitle}</StepHeading>
        <p role="status" aria-live="polite" className="mt-1 text-sm text-gray-600">
          {COPY.forgot.sentBody}
        </p>
        <Link href="/sign-in" className="mt-5 inline-block text-sm font-medium text-gray-600 underline">
          {COPY.forgot.backToSignIn}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <StepHeading subtitle={COPY.forgot.body}>{COPY.forgot.title}</StepHeading>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {error ? <Banner>{error}</Banner> : null}
        <TextField
          label={COPY.forgot.emailLabel}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" loading={loading} loadingLabel={COPY.forgot.sending}>
          {COPY.forgot.submit}
        </Button>
      </form>
      <Link href="/sign-in" className="mt-4 inline-block text-sm font-medium text-gray-600 underline">
        {COPY.forgot.backToSignIn}
      </Link>
      <p aria-live="polite" className="sr-only">
        {loading ? COPY.forgot.sending : ""}
      </p>
    </AuthCard>
  );
}

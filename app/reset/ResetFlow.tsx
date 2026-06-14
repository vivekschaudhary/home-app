"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthCard, Banner, Button, PasswordField, StepHeading } from "@wealth/ui";
import { updatePassword } from "@vc1023/passkey-2fa/client";
import { COPY } from "@/app/lib/copy";

// WLT-14 — set a new password under the recovery session the callback established.
// `hasSession=false` means the link was missing / expired / already used → the
// honest expired state (no password field), never a crash.
export function ResetFlow({ hasSession }: { hasSession: boolean }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  if (!hasSession && !done) {
    return (
      <AuthCard>
        <StepHeading subtitle={COPY.reset.expiredBody}>{COPY.reset.expiredTitle}</StepHeading>
        <Link
          href="/forgot"
          className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {COPY.reset.expiredCta}
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard>
        <StepHeading ref={doneRef} subtitle={COPY.reset.doneBody}>
          {COPY.reset.doneTitle}
        </StepHeading>
        <Link
          href="/sign-in"
          className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {COPY.reset.doneCta}
        </Link>
        <p aria-live="polite" role="status" className="sr-only">
          {COPY.resetA11y.passwordUpdated}
        </p>
      </AuthCard>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError(COPY.passwordErrors.weak);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await updatePassword(password);
    setLoading(false);
    if (!res.ok) {
      setError(
        res.error === "validation_password"
          ? COPY.passwordErrors.weak
          : res.error === "reset_link_invalid"
            ? COPY.reset.expiredBody
            : res.error === "rate_limited"
              ? COPY.passwordErrors.rateLimited
              : res.error === "network"
                ? COPY.passwordErrors.network
                : COPY.passwordErrors.server,
      );
      return;
    }
    setDone(true);
  }

  return (
    <AuthCard>
      <StepHeading subtitle={COPY.reset.body}>{COPY.reset.title}</StepHeading>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {error ? <Banner>{error}</Banner> : null}
        <PasswordField
          label={COPY.reset.passwordLabel}
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showLabel={COPY.a11y.passwordShow}
          hideLabel={COPY.a11y.passwordHide}
          capsLockLabel={COPY.a11y.capslock}
        />
        <Button type="submit" loading={loading} loadingLabel={COPY.reset.saving}>
          {COPY.reset.submit}
        </Button>
      </form>
      <p aria-live="polite" className="sr-only">
        {loading ? COPY.reset.saving : ""}
      </p>
    </AuthCard>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthCard, Banner, Button, CodeInput, PasswordField, StepHeading } from "@wealth/ui";
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
  // SUP-7 — an MFA account must enter its authenticator code to finish the reset.
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  // When the second factor is first requested, move focus to the code field.
  useEffect(() => {
    if (needsTotp) codeRef.current?.focus();
  }, [needsTotp]);

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
    setCodeError(null);
    const res = await updatePassword(password, needsTotp ? totpCode : undefined);
    setLoading(false);
    if (!res.ok) {
      // The account has MFA → reveal the authenticator field and ask for the code
      // (not an error — a required next step).
      if (res.error === "mfa_required") {
        setNeedsTotp(true);
        setError(null);
        return;
      }
      // A wrong/expired code shows ON the code field, keeping the user in place.
      if (res.error === "invalid_code" || res.error === "expired_code") {
        setCodeError(res.error === "expired_code" ? COPY.reset.codeExpired : COPY.reset.codeInvalid);
        return;
      }
      setError(
        res.error === "validation_password"
          ? COPY.passwordErrors.weak
          : res.error === "same_password"
            ? COPY.passwordErrors.samePassword
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
        {needsTotp ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{COPY.reset.mfaPrompt}</p>
            <CodeInput
              ref={codeRef}
              label={COPY.totpChallenge.codeLabel}
              hint={COPY.a11y.codeHint}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              error={codeError ?? undefined}
            />
          </div>
        ) : null}
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

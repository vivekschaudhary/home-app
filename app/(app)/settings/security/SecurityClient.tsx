"use client";

import { useRef, useState } from "react";
import {
  removeTotp,
  startTotpEnroll,
  verifyTotpEnroll,
  type ApiErrorCode,
} from "@vc1023/passkey-2fa/client";
import {
  AuthCard,
  Banner,
  Button,
  CodeInput,
  ConfirmDialog,
  FactorRow,
  QrPanel,
  StepHeading,
  Toast,
} from "@wealth/ui";
import { COPY } from "@/app/lib/copy";

function enrollErrorCopy(error: ApiErrorCode | null): string {
  switch (error) {
    case "invalid_code":
      return COPY.errors.totpInvalidCode;
    case "expired_code":
      return COPY.errors.totpExpiredCode;
    case "already_enrolled":
      return COPY.errors.totpAlreadyEnrolled;
    case "network":
      return COPY.errors.network;
    default:
      return COPY.errors.server;
  }
}

export function SecurityClient({ initialTotpEnrolled }: { initialTotpEnrolled: boolean }) {
  const [totpEnrolled, setTotpEnrolled] = useState(initialTotpEnrolled);
  const [mode, setMode] = useState<"idle" | "enrolling">("idle");
  const [enroll, setEnroll] = useState<{ factorId: string; qrCode: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    const res = await startTotpEnroll();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEnroll({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
    setCode("");
    setMode("enrolling");
    setTimeout(() => headingRef.current?.focus(), 0);
  }

  async function verifyEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setError(null);
    setBusy(true);
    const res = await verifyTotpEnroll(enroll.factorId, code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "server");
      codeRef.current?.focus();
      return;
    }
    setTotpEnrolled(true);
    setMode("idle");
    setEnroll(null);
    setToast(COPY.totpEnroll.success);
  }

  async function confirmRemove() {
    setRemoveError(null);
    setBusy(true);
    const res = await removeTotp();
    setBusy(false);
    setRemoveOpen(false);
    if (!res.ok) {
      setRemoveError(res.error === "last_factor" ? COPY.totpRemove.lastFactor : COPY.errors.server);
      return;
    }
    setTotpEnrolled(false);
  }

  return (
    <div>
      {/* WLT-20: rendered inside the app shell — nav/back is the shell's job. */}
      <h1 className="text-xl font-semibold text-gray-900">{COPY.security.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{COPY.security.subtitle}</p>

      {mode === "idle" ? (
        <section className="mt-8 space-y-3">
          <FactorRow
            label={COPY.security.passkeyLabel}
            status={COPY.security.passkeyStatus}
            enrolled
          />
          <FactorRow
            label={COPY.security.totpLabel}
            status={totpEnrolled ? COPY.security.totpEnrolledStatus : COPY.security.totpEmptyStatus}
            enrolled={totpEnrolled}
            action={
              totpEnrolled ? (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveError(null);
                    setRemoveOpen(true);
                  }}
                  className="text-sm font-medium text-red-600 underline hover:text-red-700"
                >
                  {COPY.security.totpRemove}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startEnroll}
                  disabled={busy}
                  className="text-sm font-medium text-gray-900 underline disabled:opacity-60"
                >
                  {COPY.security.totpEmptyCta}
                </button>
              )
            }
          />
          {removeError ? <Banner>{removeError}</Banner> : null}
          {error ? <Banner>{enrollErrorCopy(error)}</Banner> : null}
        </section>
      ) : (
        <section className="mt-8">
          <AuthCard>
            <StepHeading ref={headingRef} subtitle={COPY.totpEnroll.body}>
              {COPY.totpEnroll.title}
            </StepHeading>
            {enroll ? (
              <div className="space-y-4">
                <QrPanel
                  qrCode={enroll.qrCode}
                  secret={enroll.secret}
                  keyLabel={COPY.totpEnroll.manualKeyLabel}
                  copyLabel={COPY.totpEnroll.manualKeyCopy}
                  copiedLabel={COPY.a11y.copyKeyDone}
                />
                <form onSubmit={verifyEnroll} noValidate className="space-y-4">
                  <CodeInput
                    ref={codeRef}
                    label={COPY.totpEnroll.codeLabel}
                    hint={COPY.a11y.codeHint}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    error={error ? enrollErrorCopy(error) : undefined}
                  />
                  <Button type="submit" loading={busy} loadingLabel={COPY.totpEnroll.verifying}>
                    {COPY.totpEnroll.cta}
                  </Button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setEnroll(null);
                    setError(null);
                  }}
                  className="w-full text-center text-sm font-medium text-gray-600 underline"
                >
                  {COPY.security.cancel}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-600">{COPY.totpEnroll.loading}</p>
            )}
          </AuthCard>
        </section>
      )}

      <ConfirmDialog
        open={removeOpen}
        title={COPY.totpRemove.confirmTitle}
        body={COPY.totpRemove.confirmBody}
        confirmLabel={COPY.totpRemove.confirmCta}
        cancelLabel={COPY.security.cancel}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveOpen(false)}
        loading={busy}
      />
      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

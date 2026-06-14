"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserSupportsPasskeys,
  challengePasskey,
  getFactors,
  signIn,
  signInSchema,
  signInWithTotp,
  type ApiErrorCode,
} from "@vc1023/passkey-2fa/client";
import {
  AuthCard,
  Banner,
  Button,
  CodeInput,
  PasswordField,
  StepHeading,
  TextField,
  Toast,
} from "@wealth/ui";
import { COPY } from "@/app/lib/copy";

function bannerCopy(error?: ApiErrorCode): string {
  switch (error) {
    case "invalid_credentials":
      return COPY.errors.invalidCredentials;
    case "email_confirmation_required":
      return COPY.errors.emailConfirmationRequired;
    case "rate_limited":
      return COPY.errors.rateLimited;
    case "network":
      return COPY.errors.network;
    case "server":
      return COPY.errors.server;
    default:
      return COPY.errors.unknown;
  }
}

function totpErrorCopy(error: ApiErrorCode | null): string {
  switch (error) {
    case "invalid_code":
      return COPY.errors.totpInvalidCode;
    case "expired_code":
      return COPY.errors.totpExpiredCode;
    case "network":
      return COPY.errors.network;
    default:
      return COPY.errors.server;
  }
}

type ChallengeError = "cancelled" | "error" | null;

export function SignInFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "challenge">("credentials");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState<ChallengeError>(null);
  const [success, setSuccess] = useState(false);

  // Authenticator-app (TOTP) fallback (WLT-7).
  const [subStep, setSubStep] = useState<"passkey" | "totp">("passkey");
  const [factors, setFactors] = useState<{ passkey: boolean; totp: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [totpError, setTotpError] = useState<ApiErrorCode | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  const [showNoBackup, setShowNoBackup] = useState(false);
  const [passkeysSupported, setPasskeysSupported] = useState(true);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const challengeHeadingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // Guards against concurrent challenges — e.g. React StrictMode double-invoking
  // the auto-challenge effect in dev would otherwise race two ceremonies.
  const inFlight = useRef(false);

  const runChallenge = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChallengeError(null);
    setChallengeLoading(true);
    try {
      const result = await challengePasskey();
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/onboarding/intent"), 900);
        return;
      }
      setChallengeError(result.reason === "cancelled" ? "cancelled" : "error");
    } finally {
      setChallengeLoading(false);
      inFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (step !== "challenge") return;
    challengeHeadingRef.current?.focus();
    const supported = browserSupportsPasskeys();
    setPasskeysSupported(supported);
    if (supported) void runChallenge(); // only ceremony-capable browsers auto-challenge
    void getFactors().then(setFactors); // gates the authenticator fallback link
  }, [step, runChallenge]);

  // If the passkey can't be used here, route straight to the authenticator
  // (AC3/AC4): use it when enrolled, otherwise the no-backup path renders.
  useEffect(() => {
    if (step === "challenge" && !passkeysSupported && factors?.totp && subStep === "passkey") {
      setSubStep("totp");
    }
  }, [step, passkeysSupported, factors, subStep]);

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTotpError(null);
    setTotpLoading(true);
    const res = await signInWithTotp(code);
    setTotpLoading(false);
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push("/onboarding/intent"), 900);
      return;
    }
    setTotpError(res.error ?? "server");
    codeRef.current?.focus();
  }

  async function onCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(undefined);
    setPasswordError(undefined);
    setBanner(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      let hasEmail = false;
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") {
          setEmailError(COPY.errors.validationEmail);
          hasEmail = true;
        }
        if (issue.path[0] === "password") setPasswordError(COPY.errors.validationPassword);
      }
      (hasEmail ? emailRef : passwordRef).current?.focus();
      return;
    }

    setLoading(true);
    const res = await signIn(email, password);
    setLoading(false);

    if (res.ok) {
      // Always advance to the second factor. The challenge step decides what to
      // show based on passkey support + which factors the account has — never
      // dead-end a user who has an authenticator backup (AC3/AC4).
      setStep("challenge");
      return;
    }
    setBanner(bannerCopy(res.error));
  }

  if (step === "credentials") {
    return (
      <AuthCard>
        <StepHeading>{COPY.signin.title}</StepHeading>
        <form onSubmit={onCredentialsSubmit} noValidate className="space-y-4">
          {banner ? <Banner>{banner}</Banner> : null}
          <TextField
            ref={emailRef}
            label={COPY.signup.emailLabel}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
          <PasswordField
            ref={passwordRef}
            label={COPY.signup.passwordLabel}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            showLabel={COPY.a11y.passwordShow}
            hideLabel={COPY.a11y.passwordHide}
            capsLockLabel={COPY.a11y.capslock}
          />
          <Button type="submit" loading={loading} loadingLabel={COPY.signin.ctaLoading}>
            {COPY.signin.cta}
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot" className="font-medium text-gray-500 underline hover:text-gray-700">
              {COPY.forgot.link}
            </Link>
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/sign-up" className="font-medium text-gray-900 underline">
            {COPY.signin.signupLink}
          </Link>
        </p>
      </AuthCard>
    );
  }

  // step === "challenge", authenticator-app sub-step (AC3)
  if (subStep === "totp") {
    return (
      <AuthCard>
        <StepHeading ref={challengeHeadingRef} subtitle={COPY.totpChallenge.body}>
          {COPY.totpChallenge.title}
        </StepHeading>
        <form onSubmit={onTotpSubmit} noValidate className="space-y-4">
          <CodeInput
            ref={codeRef}
            label={COPY.totpChallenge.codeLabel}
            hint={COPY.a11y.codeHint}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            error={totpError ? totpErrorCopy(totpError) : undefined}
          />
          <Button type="submit" loading={totpLoading} loadingLabel={COPY.totpChallenge.verifying}>
            {totpError ? COPY.totpChallenge.retry : COPY.totpChallenge.cta}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setSubStep("passkey");
            setTotpError(null);
          }}
          className="mt-4 w-full text-center text-sm font-medium text-gray-600 underline hover:text-gray-900"
        >
          {COPY.totpChallenge.usePasskey}
        </button>
        {success ? <Toast message={COPY.signinSuccess} /> : null}
      </AuthCard>
    );
  }

  // step === "challenge", passkey sub-step (default)
  return (
    <AuthCard>
      <StepHeading
        ref={challengeHeadingRef}
        subtitle={passkeysSupported ? COPY.mfaChallenge.body : undefined}
      >
        {COPY.mfaChallenge.title}
      </StepHeading>

      {passkeysSupported ? (
        <>
          {challengeError === "error" ? <Banner>{COPY.errors.server}</Banner> : null}
          {challengeError === "cancelled" ? (
            <Banner variant="info">{COPY.mfaChallenge.body}</Banner>
          ) : null}
          <Button
            onClick={runChallenge}
            loading={challengeLoading}
            loadingLabel={COPY.mfaEnroll.loading}
          >
            {COPY.mfaChallenge.retry}
          </Button>
        </>
      ) : null}

      {factors?.totp ? (
        <button
          type="button"
          onClick={() => {
            setSubStep("totp");
            setCode("");
            setTotpError(null);
          }}
          className="mt-4 w-full text-center text-sm font-medium text-gray-600 underline hover:text-gray-900"
        >
          {COPY.signinFallback.useAuthenticator}
        </button>
      ) : factors && !factors.totp ? (
        <div className="mt-4 text-center">
          {/* When passkeys can't be used here, surface the honest no-backup
              explainer directly (no passkey to fall back from). */}
          {!passkeysSupported || showNoBackup ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-left" role="status">
              <p className="text-sm font-medium text-gray-900">{COPY.signinFallback.noBackupTitle}</p>
              <p className="mt-1 text-sm text-gray-600">{COPY.signinFallback.noBackupBody}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNoBackup(true)}
              className="text-sm font-medium text-gray-600 underline hover:text-gray-900"
            >
              {COPY.signinFallback.noBackupTitle}
            </button>
          )}
        </div>
      ) : null}

      {success ? <Toast message={COPY.signinSuccess} /> : null}
    </AuthCard>
  );
}

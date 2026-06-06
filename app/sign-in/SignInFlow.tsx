"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { signInSchema } from "@wealth/core";
import { AuthCard, Banner, Button, PasswordField, StepHeading, TextField, Toast } from "@wealth/ui";
import { postJSON, type ApiErrorCode } from "@/app/lib/api-client";
import { COPY } from "@/app/lib/copy";

function bannerCopy(error?: ApiErrorCode): string {
  switch (error) {
    case "invalid_credentials":
      return COPY.errors.invalidCredentials;
    case "network":
      return COPY.errors.network;
    case "server":
      return COPY.errors.server;
    // "rate_limited" has no dedicated copy yet (UX Writer follow-up) → generic.
    default:
      return COPY.errors.unknown;
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

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const challengeHeadingRef = useRef<HTMLHeadingElement>(null);

  const runChallenge = useCallback(async () => {
    setChallengeError(null);
    setChallengeLoading(true);

    const opt = await postJSON("/api/auth/webauthn/authenticate/options");
    if (!opt.ok) {
      setChallengeLoading(false);
      setChallengeError("error");
      return;
    }

    let authResp;
    try {
      authResp = await startAuthentication({
        optionsJSON: opt.data as PublicKeyCredentialRequestOptionsJSON,
      });
    } catch (err) {
      setChallengeLoading(false);
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "AbortError") {
        setChallengeError("cancelled");
        return;
      }
      setChallengeError("error");
      return;
    }

    const verify = await postJSON("/api/auth/webauthn/authenticate/verify", { response: authResp });
    setChallengeLoading(false);
    if (verify.ok) {
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 900);
      return;
    }
    setChallengeError("error");
  }, [router]);

  useEffect(() => {
    if (step === "challenge") {
      challengeHeadingRef.current?.focus();
      void runChallenge();
    }
  }, [step, runChallenge]);

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
    const res = await postJSON("/api/auth/sign-in", { email, password });
    setLoading(false);

    if (res.ok) {
      if (!browserSupportsWebAuthn()) {
        router.push("/unsupported");
        return;
      }
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
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/sign-up" className="font-medium text-gray-900 underline">
            {COPY.signin.signupLink}
          </Link>
        </p>
      </AuthCard>
    );
  }

  // step === "challenge"
  return (
    <AuthCard>
      <StepHeading ref={challengeHeadingRef} subtitle={COPY.mfaChallenge.body}>
        {COPY.mfaChallenge.title}
      </StepHeading>

      {challengeError === "error" ? <Banner>{COPY.errors.server}</Banner> : null}
      {challengeError === "cancelled" ? <Banner variant="info">{COPY.mfaChallenge.body}</Banner> : null}

      <Button onClick={runChallenge} loading={challengeLoading} loadingLabel={COPY.mfaEnroll.loading}>
        {COPY.mfaChallenge.retry}
      </Button>

      {success ? <Toast message={COPY.signinSuccess} /> : null}
    </AuthCard>
  );
}

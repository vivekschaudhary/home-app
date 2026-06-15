"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  browserSupportsPasskeys,
  enrollPasskey,
  passwordStrength,
  signOut,
  signUp,
  signUpSchema,
  type ApiErrorCode,
} from "@vc1023/passkey-2fa/client";
import {
  AuthCard,
  Banner,
  Button,
  PasswordField,
  PasswordStrength,
  StepHeading,
  TextField,
  Toast,
} from "@wealth/ui";
import { COPY } from "@/app/lib/copy";

// Exported for unit coverage (SUP-8): the page-level banner mapping is the
// contract that turns a discriminated API code into an actionable message.
export function bannerCopy(error?: ApiErrorCode): string | null {
  switch (error) {
    case "network":
      return COPY.errors.network;
    case "server":
    case "email_confirmation_required":
      return COPY.errors.server;
    case "rate_limited": // SUP-8: surface the actionable rate-limit outcome (copy already exists)
      return COPY.errors.rateLimited;
    case "verify":
    case "unknown":
      return COPY.errors.unknown;
    default:
      return null; // field-level errors render inline
  }
}

type EnrollError = "cancelled" | "error" | null;

export function SignUpFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "enroll">("credentials");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<EnrollError>(null);
  const [enrolled, setEnrolled] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const enrollHeadingRef = useRef<HTMLHeadingElement>(null);
  const createPasskeyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (step === "enroll") enrollHeadingRef.current?.focus();
  }, [step]);

  const strength = passwordStrength(password);

  async function onCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(undefined);
    setPasswordError(undefined);
    setBanner(null);

    const parsed = signUpSchema.safeParse({ email, password });
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
    const res = await signUp(email, password);
    setLoading(false);

    if (res.ok) {
      if (!browserSupportsPasskeys()) {
        router.push("/unsupported");
        return;
      }
      setStep("enroll");
      return;
    }
    if (res.error === "validation_email") {
      setEmailError(COPY.errors.validationEmail);
      emailRef.current?.focus();
      return;
    }
    if (res.error === "validation_password") {
      setPasswordError(COPY.errors.validationPassword);
      passwordRef.current?.focus();
      return;
    }
    setBanner(bannerCopy(res.error));
  }

  async function onCreatePasskey() {
    setEnrollError(null);
    setEnrollLoading(true);
    const result = await enrollPasskey();
    setEnrollLoading(false);

    if (result.ok) {
      setEnrolled(true);
      setTimeout(() => router.push("/onboarding/intent"), 1200);
      return;
    }
    if (result.reason === "cancelled") {
      setEnrollError("cancelled");
      createPasskeyRef.current?.focus();
      return;
    }
    if (result.reason === "unsupported") {
      router.push("/unsupported");
      return;
    }
    setEnrollError("error");
  }

  async function onSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  if (step === "credentials") {
    return (
      <AuthCard>
        <StepHeading>{COPY.signup.title}</StepHeading>
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
          <div className="space-y-2">
            <PasswordField
              ref={passwordRef}
              label={COPY.signup.passwordLabel}
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helper={COPY.signup.passwordHelper}
              error={passwordError}
              showLabel={COPY.a11y.passwordShow}
              hideLabel={COPY.a11y.passwordHide}
              capsLockLabel={COPY.a11y.capslock}
            />
            {password.length > 0 ? (
              <PasswordStrength score={strength.score} label={strength.label} />
            ) : null}
          </div>
          <Button type="submit" loading={loading} loadingLabel={COPY.signup.ctaLoading}>
            {COPY.signup.cta}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/sign-in" className="font-medium text-gray-900 underline">
            {COPY.signup.signinLink}
          </Link>
        </p>
      </AuthCard>
    );
  }

  // step === "enroll"
  return (
    <AuthCard>
      <StepHeading ref={enrollHeadingRef}>{COPY.mfaEnroll.title}</StepHeading>
      <p className="mb-5 text-sm text-gray-600">{COPY.mfaEnroll.body}</p>

      {enrollError === "cancelled" ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3" role="alert">
          <p className="text-sm font-medium text-amber-900">{COPY.mfaEnroll.cancelledTitle}</p>
          <p className="mt-1 text-sm text-amber-800">{COPY.mfaEnroll.cancelledBody}</p>
        </div>
      ) : null}
      {enrollError === "error" ? <Banner>{COPY.errors.server}</Banner> : null}

      <Button
        ref={createPasskeyRef}
        onClick={onCreatePasskey}
        loading={enrollLoading}
        loadingLabel={COPY.mfaEnroll.loading}
        className="mt-1"
      >
        {enrollError === "cancelled" ? COPY.mfaEnroll.cancelledCta : COPY.mfaEnroll.cta}
      </Button>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 w-full text-center text-sm font-medium text-gray-600 underline hover:text-gray-900"
      >
        {COPY.mfaEnroll.signout}
      </button>

      {enrolled ? <Toast message={COPY.mfaEnroll.success} /> : null}
    </AuthCard>
  );
}

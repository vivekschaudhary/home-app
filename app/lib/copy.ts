// Verbatim UI copy from docs/bets/WLT-1/stories/WLT-6/copy.md.
// PM refusal rule: UX Writer copy is used verbatim, never paraphrased (AC6).
// If a string changes, change it in copy.md first, then mirror here.

export const COPY = {
  signup: {
    title: "Create your account",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordHelper: "At least 12 characters. A short sentence works well.",
    cta: "Create account",
    ctaLoading: "Creating account…",
    signinLink: "Already have an account? Sign in",
  },
  mfaEnroll: {
    title: "Secure your account with a passkey",
    body: "A passkey uses your face, fingerprint, or device PIN — no codes to type. It keeps your financial data locked to devices you trust.",
    cta: "Create passkey",
    loading: "Waiting for your device…",
    cancelledTitle: "Passkey not created",
    cancelledBody:
      "The passkey prompt was closed before finishing. Your account needs a passkey to continue.",
    cancelledCta: "Try again",
    success: "Passkey created. Your account is protected.",
    signout: "Sign out",
  },
  mfaUnsupported: {
    title: "This browser doesn't support passkeys",
    body: "To keep your financial data safe, we require a passkey. Use a current version of Chrome, Safari, Edge, or Firefox on this or another device, then sign in again.",
  },
  signin: {
    title: "Sign in",
    cta: "Sign in",
    ctaLoading: "Signing in…",
    signupLink: "New here? Create an account",
  },
  mfaChallenge: {
    title: "Confirm it's you",
    body: "Use your passkey to finish signing in.",
    retry: "Try again",
  },
  signinSuccess: "Welcome back.",
  errors: {
    validationEmail: "Enter a valid email address, like name@example.com.",
    validationPassword: "Your password needs at least 12 characters.",
    invalidCredentials: "That email and password combination doesn't match our records. Try again.",
    network: "You appear to be offline. Check your connection and try again.",
    server: "Something went wrong on our side — your information is safe. Try again in a minute.",
    unknown:
      "That didn't work, and we're not sure why. Try again; if it keeps happening, contact support.",
  },
  a11y: {
    passwordShow: "Show password",
    passwordHide: "Hide password",
    capslock: "Caps Lock is on",
  },
} as const;

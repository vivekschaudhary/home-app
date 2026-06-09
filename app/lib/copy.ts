// Verbatim UI copy. PM refusal rule: UX Writer copy is used verbatim, never
// paraphrased — change it in copy.md first, then mirror here. Sources:
//   - auth (signup/mfa/totp/errors/a11y): docs/bets/WLT-1/stories/WLT-6 + WLT-7
//   - accounts/consent/connect/disconnect: docs/bets/WLT-2/stories/WLT-9/copy.md

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
  // ── WLT-7: authenticator-app (TOTP) backup factor ────────────────────────
  security: {
    title: "Security",
    subtitle: "How you sign in and protect your account.",
    passkeyLabel: "Passkey",
    passkeyStatus: "Added",
    totpLabel: "Authenticator app",
    totpEmptyStatus: "Not set up",
    totpEmptyCta: "Add authenticator app",
    totpEnrolledStatus: "Added",
    totpRemove: "Remove",
    cancel: "Cancel",
  },
  nudge: {
    title: "Add a backup way to sign in",
    body: "Right now your passkey is the only way in. Add an authenticator app so you're not locked out if you lose your device.",
    cta: "Add a backup",
    dismiss: "Not now",
  },
  totpEnroll: {
    title: "Add your authenticator app",
    body: "Scan this with an authenticator app like Google Authenticator, 1Password, or Authy, then enter the 6-digit code it shows.",
    manualKeyLabel: "Can't scan? Enter this key in your app",
    manualKeyCopy: "Copy key",
    codeLabel: "6-digit code",
    cta: "Verify and add",
    loading: "Preparing…",
    verifying: "Verifying…",
    success: "Authenticator app added. You now have a backup.",
  },
  totpChallenge: {
    title: "Enter your authenticator code",
    body: "Open your authenticator app and enter the current 6-digit code.",
    codeLabel: "6-digit code",
    cta: "Verify",
    verifying: "Verifying…",
    retry: "Try again",
    usePasskey: "Use your passkey instead",
  },
  signinFallback: {
    useAuthenticator: "Use your authenticator app instead",
    noBackupTitle: "Can't use your passkey?",
    noBackupBody:
      "This account doesn't have a backup set up yet. Contact support and we'll help you get back in.",
  },
  totpRemove: {
    confirmTitle: "Remove your authenticator app?",
    confirmBody:
      "You'll go back to using only your passkey. You can add an authenticator again anytime.",
    confirmCta: "Remove",
    lastFactor:
      "You can't remove your only backup while it's your sole protection. Add another way to sign in first.",
  },
  errors: {
    validationEmail: "Enter a valid email address, like name@example.com.",
    validationPassword: "Your password needs at least 12 characters.",
    invalidCredentials: "That email and password combination doesn't match our records. Try again.",
    network: "You appear to be offline. Check your connection and try again.",
    server: "Something went wrong on our side — your information is safe. Try again in a minute.",
    unknown:
      "That didn't work, and we're not sure why. Try again; if it keeps happening, contact support.",
    totpInvalidCode: "That code isn't right. Check your authenticator app and try again.",
    totpExpiredCode: "That code expired. Enter the current one from your app.",
    totpAlreadyEnrolled: "You already have an authenticator app set up.",
  },
  // Verbatim from docs/bets/WLT-2/stories/WLT-9/copy.md (account aggregation).
  accounts: {
    title: "Accounts",
    emptyTitle: "No accounts connected yet",
    emptyBody: "Connect a bank to see your real transactions and let the platform work for you.",
    emptyCta: "Connect your first account",
    addAnother: "Add another account",
    syncing: "Syncing your transactions…",
    connectedStatus: "Connected",
    syncingStatus: "Syncing",
    needsReauthStatus: "Needs sign-in", // connection-health states surface fully in a later story
    errorStatus: "Error",
    rowLastSynced: "Updated {time}", // {time} = relative time (e.g. "just now", "2m ago")
    disconnect: "Disconnect",
  },
  consent: {
    title: "Connect your bank",
    body: "We use Plaid to securely connect your bank — we never see or store your bank login.",
    accessHeading: "What we'll access",
    accessItem1: "Your account names and balances",
    accessItem2: "Your transactions from the last 90 days",
    whyHeading: "Why",
    whyBody: "To show your real money picture and power your workflows and insights.",
    retentionHeading: "How long",
    retentionBody: "Until you disconnect. You can remove an account anytime, and we'll stop updating it.",
    cta: "Connect account",
    notNow: "Not now",
  },
  connect: {
    preparing: "Opening your bank…",
    success: "Account connected — importing your last 90 days of transactions.",
  },
  disconnectConfirm: {
    title: "Disconnect this account?",
    body: "We'll stop updating it and keep your existing history. You can reconnect anytime.",
    cta: "Disconnect",
    cancel: "Cancel",
  },
  aggregationErrors: {
    cancelled: "No account connected — try again when you're ready.",
    institutionUnavailable: "Your bank is temporarily unavailable — try again in a few minutes.",
    network: "Connection lost — check your internet and try again.",
    server: "Something went wrong on our side — your information is safe. Try again in a minute.",
  },
  a11y: {
    passwordShow: "Show password",
    passwordHide: "Hide password",
    capslock: "Caps Lock is on",
    codeHint: "Enter the 6 digits from your authenticator app.",
    copyKeyDone: "Key copied",
    intentGroup: "{cluster} — choose one", // {cluster} = the cluster header
    intentDeclared: "Saved. Putting your plan together.",
  },
  // WLT-11 intent front door (the cluster headers + starter-intent labels live in
  // @wealth/core INTENT_CLUSTERS — they're the taxonomy contract). Screen copy:
  intent: {
    title: "What would you like help with?",
    subtitle: "Pick what feels closest. You can always change it later.",
    cta: "Continue",
    explore: "I'm not sure yet — just let me look around",
    declaring: "Saving…",
    doneTitle: "Got it. We're putting your plan together.",
    doneBody: "We'll use this to set up the right things for you. Next, connect an account so we can work with your real numbers.",
    doneCta: "Connect an account",
    doneSecondary: "I'll do that later",
  },
  intentErrors: {
    save: "We couldn't save that — give it another try.",
    network: "You appear to be offline. Check your connection and try again.",
    server: "Something went wrong on our side — your information is safe. Try again in a minute.",
  },
} as const;

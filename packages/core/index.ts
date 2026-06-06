// @wealth/core — domain logic: intents, goals, the workflow/block engine.
// Auth observability contract (WLT-5 funnel events + audit actions). The auth
// mechanics (validation, AAL2, WebAuthn) live in @vivekschaudhary/passkey-2fa.
export * from "./funnel";
export * from "./audit";

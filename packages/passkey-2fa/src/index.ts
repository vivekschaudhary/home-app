// @vc1023/passkey-2fa — server entry (Node runtime).
//
// Drop-in password + passkey (WebAuthn) 2FA for Next.js App Router + Supabase.
//   - server toolkit:        import { requireAal2, ... } from "@vc1023/passkey-2fa"
//   - route handlers:        import { createPasskeyAuthHandlers } from "@vc1023/passkey-2fa/routes"
//   - middleware:            import { createPasskeyMiddleware } from "@vc1023/passkey-2fa/middleware"
//   - browser helpers:       import { signUp, enrollPasskey, ... } from "@vc1023/passkey-2fa/client"
//
// This barrel uses node:crypto + next/headers — server-only. Import client code
// from "/client".

export * from "./config";
export * from "./aal2";
export * from "./validation";
export * from "./guard";
export * from "./webauthn";
export * from "./totp";
export * from "./rate-limit";
export * from "./supabase";
export * from "./types";
export * from "./events";

import { createPasskeyMiddleware } from "@vc1023/passkey-2fa/middleware";

export const middleware = createPasskeyMiddleware({
  protectedPaths: ["/dashboard"],
  signInPath: "/sign-in",
});

export const config = {
  // Run on everything except static assets + image optimizer.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

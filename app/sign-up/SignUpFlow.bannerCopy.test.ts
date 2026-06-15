import { describe, expect, it } from "vitest";
import { bannerCopy } from "./SignUpFlow";
import { COPY } from "@/app/lib/copy";

// SUP-8 — the server now discriminates sign-up errors (mapSignUpError). This
// asserts the page-level banner actually SURFACES the actionable outcome — the
// review caught that rate_limited was still funneled to the generic banner.
describe("SignUpFlow bannerCopy (SUP-8)", () => {
  it("rate_limited surfaces the actionable rate-limit message, NOT the generic banner", () => {
    expect(bannerCopy("rate_limited")).toBe(COPY.errors.rateLimited);
    expect(bannerCopy("rate_limited")).not.toBe(COPY.errors.unknown);
  });

  it("network / server stay on their own discriminated copy", () => {
    expect(bannerCopy("network")).toBe(COPY.errors.network);
    expect(bannerCopy("server")).toBe(COPY.errors.server);
    expect(bannerCopy("email_confirmation_required")).toBe(COPY.errors.server);
  });

  it("genuinely-unknown failures fall back to the generic banner; field errors render inline", () => {
    expect(bannerCopy("unknown")).toBe(COPY.errors.unknown);
    expect(bannerCopy("verify")).toBe(COPY.errors.unknown);
    expect(bannerCopy("validation_email")).toBeNull(); // inline, not a banner
  });
});

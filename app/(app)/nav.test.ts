import { describe, expect, it } from "vitest";
import { COMING_SOON_TEASER, NAV_SECTIONS, isActiveNav } from "./nav";
import { SHELL_PATHS } from "./shell-paths";

// WLT-20 — the nav config is the "mounting contract" + drives middleware
// protection. These guard its integrity so a future feature mounts cleanly and
// no shell route is left unprotected.
describe("NAV_SECTIONS / SHELL_PATHS integrity", () => {
  it("every section has a key, label, href, icon, and status", () => {
    for (const s of NAV_SECTIONS) {
      expect(s.key).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.href.startsWith("/")).toBe(true);
      expect(s.icon).toBeTruthy();
      expect(["live", "coming_soon"]).toContain(s.status);
    }
  });

  it("the expected 8 sections are present, in order, with Dashboard + Budget + Transactions + Accounts live", () => {
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual([
      "dashboard",
      "budget",
      "goals",
      "debt",
      "investments",
      "subscriptions",
      "transactions",
      "accounts",
    ]);
    // WLT-21-1 flipped budget → live; WLT-23-1 mounts transactions → live (adjacent to accounts).
    expect(NAV_SECTIONS.filter((s) => s.status === "live").map((s) => s.key)).toEqual([
      "dashboard",
      "budget",
      "transactions",
      "accounts",
    ]);
  });

  it("EVERY nav href is covered by SHELL_PATHS (no route left unprotected at the edge)", () => {
    for (const s of NAV_SECTIONS) {
      const covered = SHELL_PATHS.some((p) => s.href === p || s.href.startsWith(`${p}/`));
      expect(covered, `${s.href} must be in SHELL_PATHS`).toBe(true);
    }
    expect(SHELL_PATHS).toContain("/settings"); // the account-menu surface
  });

  it("every coming_soon section has a teaser; live sections do not need one", () => {
    for (const s of NAV_SECTIONS.filter((x) => x.status === "coming_soon")) {
      expect(COMING_SOON_TEASER[s.key]).toBeTruthy();
    }
  });
});

describe("isActiveNav", () => {
  it("matches the exact path and nested paths, not siblings", () => {
    expect(isActiveNav("/dashboard", "/dashboard")).toBe(true);
    expect(isActiveNav("/accounts/123", "/accounts")).toBe(true); // nested
    expect(isActiveNav("/budget", "/dashboard")).toBe(false);
    expect(isActiveNav("/dashboards", "/dashboard")).toBe(false); // not a false prefix match
  });
});

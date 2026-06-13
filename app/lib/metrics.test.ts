import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDuration, isAdmin } from "./metrics";

describe("isAdmin (the /admin/metrics gate, AC5)", () => {
  it("matches against the allow-list, case-insensitive + trimmed", () => {
    expect(isAdmin("vc@example.com", "vc@example.com")).toBe(true);
    expect(isAdmin("VC@Example.COM", " vc@example.com , other@x.com ")).toBe(true);
    expect(isAdmin("other@x.com", "vc@example.com,other@x.com")).toBe(true);
  });

  it("denies non-members, empty email, and an unset/empty allow-list (deny by default)", () => {
    expect(isAdmin("intruder@x.com", "vc@example.com")).toBe(false);
    expect(isAdmin("", "vc@example.com")).toBe(false);
    expect(isAdmin(null, "vc@example.com")).toBe(false);
    expect(isAdmin("vc@example.com", undefined)).toBe(false);
    expect(isAdmin("vc@example.com", "")).toBe(false);
    expect(isAdmin("vc@example.com", " , ,")).toBe(false); // junk list ≠ open door
  });

  it("never substring-matches (a@b.com must not pass for xa@b.com)", () => {
    expect(isAdmin("a@b.com", "xa@b.com")).toBe(false);
    expect(isAdmin("xa@b.com", "a@b.com")).toBe(false);
  });
});

describe("formatDuration", () => {
  it("renders m+s, s-only, and absent", () => {
    expect(formatDuration(872)).toBe("14m 32s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(180)).toBe("3m 0s");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("snapshot artifacts — no-PII + shape (AC6/AC8/AC11)", () => {
  const dir = join(process.cwd(), "docs/metrics");
  const files = readdirSync(dir).filter((f) => f.startsWith("WLT-5-") && f.endsWith(".json"));

  it("at least one baseline snapshot is committed (the bet's key_metric target)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s carries aggregates only — no emails, no UUIDs, required shape", (file) => {
    const raw = readFileSync(join(dir, file), "utf8");
    // No-PII: an email or a per-user identifier anywhere in the artifact fails.
    expect(raw).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Shape: the three metric families + n's are present.
    const snap = JSON.parse(raw) as Record<string, unknown>;
    expect(snap.bet).toBe("WLT-5");
    expect(snap).toHaveProperty("ttfv.n_completed");
    expect(snap).toHaveProperty("ttfv.n_signups");
    expect(snap).toHaveProperty("ttfv.p80_seconds");
    expect(Array.isArray((snap as { wawu_weekly: unknown[] }).wawu_weekly)).toBe(true);
    expect(Array.isArray((snap as { funnel: unknown[] }).funnel)).toBe(true);
  });
});

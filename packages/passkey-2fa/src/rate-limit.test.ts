import { describe, expect, it } from "vitest";
import { inMemoryRateLimit } from "./rate-limit";

describe("inMemoryRateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `test-${Math.floor(Math.random() * 1e9)}`;
    for (let i = 0; i < 3; i++) expect(inMemoryRateLimit(key, 3, 60_000)).toMatchObject({ ok: true });
    const blocked = inMemoryRateLimit(key, 3, 60_000) as { ok: boolean; retryAfterSeconds: number };
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("uses independent buckets per key", () => {
    const a = `a-${Math.floor(Math.random() * 1e9)}`;
    const b = `b-${Math.floor(Math.random() * 1e9)}`;
    expect(inMemoryRateLimit(a, 1, 60_000)).toMatchObject({ ok: true });
    expect(inMemoryRateLimit(a, 1, 60_000)).toMatchObject({ ok: false });
    expect(inMemoryRateLimit(b, 1, 60_000)).toMatchObject({ ok: true }); // different key still allowed
  });
});

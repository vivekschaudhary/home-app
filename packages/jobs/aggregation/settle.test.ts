import { describe, expect, it, vi } from "vitest";
import { settleHistory } from "./settle";

const noWait = () => Promise.resolve();

describe("settleHistory (WLT-10 — stamp only when actually caught up)", () => {
  it("settles (true) once a pass brings nothing new", async () => {
    const passes = [5, 3, 0]; // streaming, streaming, caught up
    const syncOnce = vi.fn((s: number) => Promise.resolve(passes[s]));
    expect(await settleHistory(syncOnce, noWait, 4)).toBe(true);
    expect(syncOnce).toHaveBeenCalledTimes(3); // stops at the 0
  });

  it("REGRESSION: capped while still streaming → false (does NOT stamp)", async () => {
    // Every attempt still returns new history → never caught up within the cap.
    const syncOnce = vi.fn(() => Promise.resolve(7));
    expect(await settleHistory(syncOnce, noWait, 4)).toBe(false);
    expect(syncOnce).toHaveBeenCalledTimes(4); // exhausted the cap, still importing
  });

  it("settles immediately when the first pass is already quiet", async () => {
    const syncOnce = vi.fn(() => Promise.resolve(0));
    expect(await settleHistory(syncOnce, noWait, 4)).toBe(true);
    expect(syncOnce).toHaveBeenCalledTimes(1);
  });

  it("waits before each attempt", async () => {
    const wait = vi.fn(() => Promise.resolve());
    await settleHistory(() => Promise.resolve(1), wait, 3);
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it, vi } from "vitest";
import { settleHistory } from "./settle";

const noWait = () => Promise.resolve();
// Drive the loop from a fixed sequence of per-pass new-row counts.
const seq = (counts: number[]) => (s: number) => Promise.resolve(counts[s] ?? 0);

describe("settleHistory (WLT-10 — settle only on STABILIZED quiet)", () => {
  it("REGRESSION: a single quiet pass is NOT enough — needs consecutive quiet", async () => {
    // quiet, then new history again → the lone quiet pass must not settle.
    const syncOnce = vi.fn(seq([0, 4, 1, 2]));
    expect(await settleHistory(syncOnce, noWait, 4, 2)).toBe(false);
  });

  it("settles once quiet is sustained for the required consecutive passes", async () => {
    // streaming, then two quiet in a row → stabilized on the 2nd quiet.
    const syncOnce = vi.fn(seq([5, 0, 0, 9]));
    expect(await settleHistory(syncOnce, noWait, 6, 2)).toBe(true);
    expect(syncOnce).toHaveBeenCalledTimes(3); // stops at the 2nd consecutive quiet
  });

  it("REGRESSION: a transient quiet between batches resets the streak", async () => {
    // 0,5,0,5,... never reaches 2 consecutive quiet → not settled within the cap.
    const syncOnce = vi.fn(seq([0, 5, 0, 5, 0, 5]));
    expect(await settleHistory(syncOnce, noWait, 6, 2)).toBe(false);
  });

  it("capped while still streaming → false (does NOT stamp)", async () => {
    const syncOnce = vi.fn(() => Promise.resolve(7));
    expect(await settleHistory(syncOnce, noWait, 5, 2)).toBe(false);
    expect(syncOnce).toHaveBeenCalledTimes(5);
  });

  it("waits before each attempt", async () => {
    const wait = vi.fn(() => Promise.resolve());
    await settleHistory(() => Promise.resolve(1), wait, 3, 2);
    expect(wait).toHaveBeenCalledTimes(3);
  });
});

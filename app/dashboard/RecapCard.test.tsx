// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecapView } from "@/app/lib/recap";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { RecapCard } from "./RecapCard";

const STEADY: Extract<RecapView, { visible: true }> = {
  visible: true,
  workflowId: "wf1",
  netWorth: 24600,
  movement: { direction: "up", delta: 420 },
  progress: { current: 24600, target: 36000, percent: 68, status: "on_track" },
  action: { type: "raise_target", kind: "recap_raise_target", suggestedTarget: 27000 },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecapCard", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(<RecapCard view={{ visible: false }} />);
    expect(container.firstChild).toBeNull();
  });

  it("steady state: movement in words + progress bar + the one action", () => {
    render(<RecapCard view={STEADY} />);
    expect(screen.getByText("Up $420 since last week")).toBeTruthy();
    expect(screen.getByText("You're on track.")).toBeTruthy();
    // progress bar exposes percent to AT
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("68");
    // exactly one primary action (raise)
    expect(screen.getByRole("button", { name: "Aim higher?" })).toBeTruthy();
  });

  it("cold-start: honest 'watching' line, never a fabricated movement number", () => {
    render(<RecapCard view={{ ...STEADY, movement: null }} />);
    expect(screen.getByText(/We've started watching your money/)).toBeTruthy();
    expect(screen.queryByText(/since last week/)).toBeNull();
  });

  it("behind: plain framing + the adjust action (no failure language)", () => {
    render(
      <RecapCard
        view={{
          ...STEADY,
          movement: { direction: "down", delta: 600 },
          progress: { current: 24000, target: 36000, percent: 67, status: "behind" },
          action: { type: "adjust_target", kind: "recap_adjust_target", suggestedTarget: 27000 },
        }}
      />,
    );
    expect(screen.getByText("A bit behind your target — here's a move.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adjust your target" })).toBeTruthy();
  });

  it("action flow: open target step → save → POSTs the recap kind → acked (focus lands)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, noop: false }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecapCard view={STEADY} />);
    fireEvent.click(screen.getByRole("button", { name: "Aim higher?" }));
    // the suggested-target one-tap accept
    fireEvent.click(screen.getByRole("button", { name: "Use this target" }));

    await waitFor(() => expect(screen.getByText("Got it — we'll keep tracking.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recap/action",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ workflowId: "wf1", target: 27000, kind: "recap_raise_target" });
  });

  it("action flow: server error shows a discriminated banner, stays retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
    render(<RecapCard view={STEADY} />);
    fireEvent.click(screen.getByRole("button", { name: "Aim higher?" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this target" }));
    await waitFor(() =>
      expect(screen.getByText(/Something went wrong on our side/)).toBeTruthy(),
    );
    // not acked — still in the target step
    expect(screen.queryByText("Got it — we'll keep tracking.")).toBeNull();
  });
});

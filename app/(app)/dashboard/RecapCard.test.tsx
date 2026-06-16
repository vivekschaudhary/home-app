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
  spending: {
    thisWeek: 1240,
    comparable: true,
    delta: { direction: "less", amount: 180 },
    topCategories: [
      { category: "Groceries", amount: 420 },
      { category: "Dining", amount: 310 },
    ],
  },
  anomaly: null,
};

const WITH_ANOMALY: Extract<RecapView, { visible: true }> = {
  ...STEADY,
  anomaly: { id: "an1", kind: "large_charge", summary: { amount: 480, category: "Groceries", date: "2026-06-14" } },
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
    render(<RecapCard view={{ ...STEADY, movement: null, spending: null }} />);
    expect(screen.getByText(/We've started watching your money/)).toBeTruthy();
    expect(screen.queryByText(/since last week/)).toBeNull();
  });

  it("spending: shows 'where your money went' + comparison + top categories (display only, no CTA)", () => {
    render(<RecapCard view={STEADY} />);
    expect(screen.getByText("Where your money went")).toBeTruthy();
    expect(screen.getByText(/Spent \$1,240 this week/)).toBeTruthy();
    expect(screen.getByText(/\$180 less than last week/)).toBeTruthy();
    expect(screen.getByText(/Groceries \$420/)).toBeTruthy();
    // still exactly ONE action button (the target action) — spending adds no CTA
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Aim higher?" })).toBeTruthy();
  });

  it("spending first-week: this-week-only + honest 'no comparison yet', no fabricated delta", () => {
    render(
      <RecapCard
        view={{
          ...STEADY,
          spending: { thisWeek: 500, comparable: false, delta: null, topCategories: [{ category: "Groceries", amount: 500 }] },
        }}
      />,
    );
    expect(screen.getByText(/We'll compare this to last week once there's a bit more history/)).toBeTruthy();
    expect(screen.queryByText(/than last week/)).toBeNull();
  });

  it("spending omitted: no section when there's nothing to show", () => {
    render(<RecapCard view={{ ...STEADY, spending: null }} />);
    expect(screen.queryByText("Where your money went")).toBeNull();
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

  // ── WLT-18: anomaly callout ──
  it("anomaly: shows the 'worth a look' callout + outranks the target action (still one prompted action)", () => {
    render(<RecapCard view={WITH_ANOMALY} />);
    expect(screen.getByText("Worth a look")).toBeTruthy();
    expect(screen.getByText("A larger-than-usual charge: $480 in Groceries on 2026-06-14.")).toBeTruthy();
    // Review it + Dismiss; the target action ("Aim higher?") is suppressed.
    expect(screen.getByRole("button", { name: "Review it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aim higher?" })).toBeNull();
  });

  it("anomaly Review it: PATCHes acted + workflowId → 'noted' (the WAWU action)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, noop: false }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<RecapCard view={WITH_ANOMALY} />);
    fireEvent.click(screen.getByRole("button", { name: "Review it" }));
    await waitFor(() => expect(screen.getByText("Thanks — noted.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/anomaly/an1", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: "acted", workflowId: "wf1" });
  });

  it("anomaly Dismiss: PATCHes dismissed (no workflowId) → callout gone, target action returns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, noop: false }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<RecapCard view={WITH_ANOMALY} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("Worth a look")).toBeNull());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: "dismissed" });
    // the target action is available again now the anomaly is gone
    expect(screen.getByRole("button", { name: "Aim higher?" })).toBeTruthy();
  });
});

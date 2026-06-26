// @vitest-environment jsdom
// WLT-26-2 — AnomalyPanelClient unit tests. Covers all AC7/AC8 requirements:
// per-kind phrasing, dismiss flow (optimistic removal + PATCH), investigate links,
// empty states, null-merchantName fallback, and sr-only accessibility labels.
//
// AnomalyPanel.tsx (the RSC shell) handles the history gate and heading; those are
// verified by the component integration + the inline JSX review. AnomalyPanelClient
// owns all client state, so tests target it directly with fixture data.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardAnomaly } from "@/app/lib/anomaly";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AnomalyPanelClient } from "./AnomalyPanelClient";

function newMerchantAnomaly(overrides: Partial<DashboardAnomaly> = {}): DashboardAnomaly {
  return {
    id: "nm1",
    kind: "new_merchant",
    summary: { amount: 42, date: "2026-06-12" },
    merchantName: "TacoHub",
    debutMonth: "2026-06",
    ...overrides,
  };
}

function categorySpike(overrides: Partial<DashboardAnomaly> = {}): DashboardAnomaly {
  return {
    id: "cs1",
    kind: "category_spike",
    summary: { category: "Food", amount: 300, baseline: 100, multiple: 3.0 },
    rawCategory: "FOOD",
    debutMonth: "2026-06",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnomalyPanelClient — empty states", () => {
  it("renders the nothing-to-flag empty state when anomaly list is empty", () => {
    render(<AnomalyPanelClient initialAnomalies={[]} />);
    expect(screen.getByText("Nothing unusual to flag right now.")).toBeTruthy();
  });
});

describe("AnomalyPanelClient — new_merchant phrasing", () => {
  it("renders the merchant name in the phrasing", () => {
    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    expect(screen.getByText("New merchant: TacoHub")).toBeTruthy();
  });

  it("falls back to anomalyKindNewMerchantUnknown when merchantName is null", () => {
    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly({ merchantName: null })]} />);
    expect(screen.getByText("New merchant — we couldn't identify it")).toBeTruthy();
  });

  it("investigate link points to /transactions?month=<debutMonth> for new_merchant", () => {
    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    const link = screen.getByRole("link", { name: "See transactions" });
    expect(link.getAttribute("href")).toBe("/transactions?month=2026-06");
  });

  it("dismiss button has the sr-only label encoding the merchant name", () => {
    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    const btn = screen.getByRole("button", { name: "Got it — don't flag TacoHub again" });
    expect(btn).toBeTruthy();
  });

  it("dismiss button shows visible 'Got it' label", () => {
    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    expect(screen.getByText("Got it")).toBeTruthy();
  });
});

describe("AnomalyPanelClient — category_spike phrasing", () => {
  it("renders the spike phrasing with category + multiple", () => {
    render(<AnomalyPanelClient initialAnomalies={[categorySpike()]} />);
    expect(screen.getByText("Food is on pace to run 3.0× your typical spend this month.")).toBeTruthy();
  });

  it("investigate link points to /transactions?category=<rawCategory>&month=<debutMonth>", () => {
    render(<AnomalyPanelClient initialAnomalies={[categorySpike()]} />);
    const link = screen.getByRole("link", { name: "See transactions" });
    expect(link.getAttribute("href")).toBe("/transactions?category=FOOD&month=2026-06");
  });

  it("dismiss button has the monthly sr-only label", () => {
    render(<AnomalyPanelClient initialAnomalies={[categorySpike()]} />);
    const btn = screen.getByRole("button", { name: "Dismiss Food spike for 2026-06" });
    expect(btn).toBeTruthy();
  });

  it("dismiss button shows visible 'Dismiss for this month' label", () => {
    render(<AnomalyPanelClient initialAnomalies={[categorySpike()]} />);
    expect(screen.getByText("Dismiss for this month")).toBeTruthy();
  });
});

describe("AnomalyPanelClient — dismiss flow", () => {
  it("calls PATCH /api/anomaly/[id] with status:dismissed on dismiss", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it — don't flag TacoHub again" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/anomaly/nm1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ status: "dismissed" });
  });

  it("optimistically removes the dismissed anomaly row from the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    expect(screen.getByText("New merchant: TacoHub")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Got it — don't flag TacoHub again" }));
    await waitFor(() => expect(screen.queryByText("New merchant: TacoHub")).toBeNull());

    // empty-state copy now shows
    expect(screen.getByText("Nothing unusual to flag right now.")).toBeTruthy();
  });

  it("keeps the row visible if the PATCH fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnomalyPanelClient initialAnomalies={[newMerchantAnomaly()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it — don't flag TacoHub again" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // row should still be visible (not dismissed on failure)
    expect(screen.getByText("New merchant: TacoHub")).toBeTruthy();
  });
});

describe("AnomalyPanelClient — investigate link", () => {
  it("investigate link falls back to /transactions when debutMonth is missing", () => {
    render(<AnomalyPanelClient initialAnomalies={[categorySpike({ debutMonth: null, rawCategory: null })]} />);
    const link = screen.getByRole("link", { name: "See transactions" });
    expect(link.getAttribute("href")).toBe("/transactions");
  });
});

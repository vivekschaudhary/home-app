// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetViewDTO } from "@/app/lib/budget-client";

const fetchBudgetMock = vi.fn();
const saveBudgetMock = vi.fn();
const clearBudgetMock = vi.fn();
const recordSpreadViewedMock = vi.fn();
vi.mock("@/app/lib/budget-client", () => ({
  fetchBudget: () => fetchBudgetMock(),
  saveBudget: (i: unknown) => saveBudgetMock(i),
  clearBudget: (c: unknown) => clearBudgetMock(c),
  recordSpreadViewed: () => recordSpreadViewedMock(),
}));

import { BudgetClient } from "./BudgetClient";

const VIEW: BudgetViewDTO = {
  rows: [
    {
      category: "FOOD_AND_DRINK",
      label: "Food And Drink",
      recommended: 500,
      actualThisMonth: 520,
      budget: { type: "amount", amount: 500 },
      effectiveCap: 500,
      status: "over",
    },
    {
      category: "TRAVEL",
      label: "Travel",
      recommended: null,
      actualThisMonth: 200,
      budget: null,
      effectiveCap: null,
      status: "none",
    },
  ],
  asOfMonth: "2026-06",
  typicalMonthlyTotal: 1500,
  hasData: true,
  // FOOD has a 12-month series (expandable); TRAVEL has none (no toggle).
  series: { FOOD_AND_DRINK: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 480, 520] },
  seriesMonths: [
    "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  ],
};

beforeEach(() => {
  fetchBudgetMock.mockResolvedValue({ ok: true, view: VIEW });
  saveBudgetMock.mockResolvedValue({ ok: true });
  clearBudgetMock.mockResolvedValue({ ok: true });
});
afterEach(() => {
  fetchBudgetMock.mockReset();
  saveBudgetMock.mockReset();
  clearBudgetMock.mockReset();
  recordSpreadViewedMock.mockReset();
});

describe("BudgetClient", () => {
  it("renders rows with recommended, actual, over/under; '—' for cold-start", () => {
    render(<BudgetClient initial={VIEW} />);
    expect(screen.getByText("Food And Drink")).toBeTruthy();
    expect(screen.getByText("$520.00")).toBeTruthy(); // this-month actual
    expect(screen.getByText(/\$20\.00 over/)).toBeTruthy(); // 520 over a 500 cap
    expect(screen.getAllByText("$500.00").length).toBeGreaterThanOrEqual(1); // recommended (= the saved cap too)
    expect(screen.getByText("—")).toBeTruthy(); // Travel cold-start recommendation
  });

  it("honest empty state when there's no data", () => {
    render(
      <BudgetClient
        initial={{ rows: [], asOfMonth: "2026-06", typicalMonthlyTotal: null, hasData: false, series: {}, seriesMonths: [] }}
      />,
    );
    expect(screen.getByText("Nothing to budget yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect an account" })).toBeTruthy();
  });

  it("set a dollar budget → POSTs limitAmount + shows the saved toast", async () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Set budget" })); // Travel
    const input = screen.getByLabelText("Monthly budget for Travel");
    fireEvent.change(input, { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBudgetMock).toHaveBeenCalledWith({ category: "TRAVEL", limitAmount: 300 }));
    await waitFor(() => expect(screen.getByText("Budget saved.")).toBeTruthy());
  });

  it("the % toggle sends limitPercent + shows the resolved helper", async () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Set budget" })); // Travel
    fireEvent.click(screen.getByRole("button", { name: "%" }));
    const input = screen.getByLabelText("Monthly budget for Travel");
    fireEvent.change(input, { target: { value: "20" } });
    expect(screen.getByText(/20% of your typical monthly spending ≈ \$300\.00\/mo/)).toBeTruthy(); // 20% of 1500
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveBudgetMock).toHaveBeenCalledWith({ category: "TRAVEL", limitPercent: 20 }));
  });

  it("blocks an invalid amount without calling save (input preserved)", async () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Set budget" }));
    const input = screen.getByLabelText("Monthly budget for Travel") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter an amount greater than 0.")).toBeTruthy();
    expect(saveBudgetMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Monthly budget for Travel") as HTMLInputElement).value).toBe("0");
  });

  it("'Use this' prefills the amount editor with the recommendation", () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this" })); // Food (recommended 500)
    expect((screen.getByLabelText("Monthly budget for Food And Drink") as HTMLInputElement).value).toBe("500");
  });

  it("expands a category's year spread (chart + sr data table); records the view; TRAVEL has no toggle", async () => {
    render(<BudgetClient initial={VIEW} />);
    // FOOD has a series → a "View the year" toggle; TRAVEL has none.
    const toggles = screen.getAllByRole("button", { name: /Show the last 12 months/ });
    expect(toggles).toHaveLength(1); // only FOOD
    fireEvent.click(toggles[0]);
    await waitFor(() => expect(recordSpreadViewedMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Monthly Food And Drink spend — last 12 months")).toBeTruthy();
    // the screen-reader equivalent carries the real current-month value, "so far"
    expect(screen.getByText("June (this month so far): $520.00")).toBeTruthy(); // sr-only data table
    expect(screen.getAllByText("July: $100.00").length).toBeGreaterThanOrEqual(1); // sr table + the SVG <title>
    // responsive month labels: single-initial (phone) + 3-letter (desktop) both present (AC2/AC6)
    expect(screen.getAllByTestId("ys-initial")).toHaveLength(12);
    expect(screen.getAllByTestId("ys-short")).toHaveLength(12);
    expect(screen.getAllByTestId("ys-short").map((e) => e.textContent)).toContain("Jun"); // current month, 3-letter
    expect(screen.getAllByTestId("ys-initial").map((e) => e.textContent)).toContain("J"); // single-initial
    // collapse → the panel is gone; re-expanding does not re-fire the event
    fireEvent.click(screen.getByRole("button", { name: /Hide the last 12 months/ }));
    expect(screen.queryByText("Monthly Food And Drink spend — last 12 months")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show the last 12 months/ }));
    expect(recordSpreadViewedMock).toHaveBeenCalledTimes(1); // once per category per load
  });

  it("the add-category picker adds a budgetable row", () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a category to budget" }));
    // pick a category not already shown (Food & Travel are present)
    fireEvent.click(screen.getByRole("button", { name: "Entertainment" }));
    expect(screen.getByText("Entertainment")).toBeTruthy(); // a new row appears
  });
});

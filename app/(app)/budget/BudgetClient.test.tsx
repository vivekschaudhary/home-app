// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetViewDTO } from "@/app/lib/budget-client";

const fetchBudgetMock = vi.fn();
const saveBudgetMock = vi.fn();
const clearBudgetMock = vi.fn();
const recordSpreadViewedMock = vi.fn();
const recordDrilldownViewedMock = vi.fn();
const fetchCategoryTransactionsMock = vi.fn();
const fetchCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();
const recategorizeTransactionMock = vi.fn();
vi.mock("@/app/lib/budget-client", () => ({
  fetchBudget: () => fetchBudgetMock(),
  saveBudget: (i: unknown) => saveBudgetMock(i),
  clearBudget: (c: unknown) => clearBudgetMock(c),
  recordSpreadViewed: () => recordSpreadViewedMock(),
  recordDrilldownViewed: () => recordDrilldownViewedMock(),
  fetchCategoryTransactions: (cat: string, month: string) => fetchCategoryTransactionsMock(cat, month),
  fetchCategories: () => fetchCategoriesMock(),
  createCategory: (name: string, kind: string) => createCategoryMock(name, kind),
  recategorizeTransaction: (i: unknown) => recategorizeTransactionMock(i),
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

// Headless UI (v2) — used by the WLT-22-2 recategorize picker — reaches for these
// browser APIs jsdom lacks (mirrors shell.test.tsx).
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  fetchBudgetMock.mockResolvedValue({ ok: true, view: VIEW });
  saveBudgetMock.mockResolvedValue({ ok: true });
  clearBudgetMock.mockResolvedValue({ ok: true });
  fetchCategoriesMock.mockResolvedValue({
    ok: true,
    categories: [
      { id: "c-food", name: "FOOD_AND_DRINK", kind: "essential", source: "seed" },
      { id: "c-rent", name: "RENT", kind: "essential", source: "seed" },
    ],
  });
  recategorizeTransactionMock.mockResolvedValue({ ok: true, count: 1 });
});
afterEach(() => {
  fetchBudgetMock.mockReset();
  saveBudgetMock.mockReset();
  clearBudgetMock.mockReset();
  recordSpreadViewedMock.mockReset();
  recordDrilldownViewedMock.mockReset();
  fetchCategoryTransactionsMock.mockReset();
  fetchCategoriesMock.mockReset();
  createCategoryMock.mockReset();
  recategorizeTransactionMock.mockReset();
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

  it("drilling into a category lists its line items; the Total reconciles to the row number", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-14", merchant: "Trader Joe's", description: "x", amount: 320, category: "FOOD_AND_DRINK" },
        { dedupKey: "dk-2", occurredOn: "2026-06-03", merchant: null, description: "Safeway", amount: 200, category: "FOOD_AND_DRINK" }, // merchant null → description
      ],
      total: 520,
    });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    await waitFor(() => expect(fetchCategoryTransactionsMock).toHaveBeenCalledWith("FOOD_AND_DRINK", "2026-06"));
    expect(await screen.findByText("Trader Joe's")).toBeTruthy();
    expect(screen.getByText("Safeway")).toBeTruthy(); // null merchant fell back to description
    // the panel Total ($520.00) reconciles to the row's "This month so far" ($520.00) → ≥2 on screen
    expect(screen.getAllByText("$520.00").length).toBeGreaterThanOrEqual(2);
  });

  it("recategorize a transaction → POSTs {dedupKey, categoryId}, acknowledges, refetches (WLT-22-2)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Costco", description: "x", amount: 520, category: "FOOD_AND_DRINK" },
      ],
      total: 520,
    });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Costco")).toBeTruthy();
    // open the per-item category picker, pick RENT (humanized "Rent")
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Costco/ }));
    fireEvent.click(await screen.findByText("Rent"));
    await waitFor(() =>
      expect(recategorizeTransactionMock).toHaveBeenCalledWith({ dedupKey: "dk-1", categoryId: "c-rent", applyToMerchant: false }),
    );
    // the move is acknowledged + the view refetches to reconcile the totals
    expect(await screen.findByText("Moved to Rent")).toBeTruthy();
    await waitFor(() => expect(fetchBudgetMock.mock.calls.length).toBeGreaterThanOrEqual(2)); // mount + post-move
  });

  it("create a custom category: empty name rejected, then created + assigned (WLT-22-2 AC3)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Costco", description: "x", amount: 520, category: "FOOD_AND_DRINK" },
      ],
      total: 520,
    });
    createCategoryMock.mockResolvedValue({ ok: true, category: { id: "c-new", name: "Rent", kind: "discretionary", source: "custom" } });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Costco")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Costco/ }));
    fireEvent.click(await screen.findByText("+ New category"));
    // submit empty → validation error, no POST
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give the category a name.")).toBeTruthy();
    expect(createCategoryMock).not.toHaveBeenCalled();
    // name it + create → POST, then the new category is assigned to the transaction
    fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Rent" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createCategoryMock).toHaveBeenCalledWith("Rent", "discretionary"));
    await waitFor(() =>
      expect(recategorizeTransactionMock).toHaveBeenCalledWith({ dedupKey: "dk-1", categoryId: "c-new", applyToMerchant: false }),
    );
  });

  it("the create-category popover closes on Escape (WLT-22)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Costco", description: "x", amount: 520, category: "FOOD_AND_DRINK" },
      ],
      total: 520,
    });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Costco")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Costco/ }));
    fireEvent.click(await screen.findByText("+ New category"));
    expect(screen.getByLabelText("Category name")).toBeTruthy(); // popover open
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Category name")).toBeNull()); // popover dismissed
  });

  it("create a category with 'remember' ticked applies it to the whole merchant (WLT-22-3)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Starbucks", description: "x", amount: 12, category: "FOOD_AND_DRINK" },
      ],
      total: 12,
    });
    createCategoryMock.mockResolvedValue({ ok: true, category: { id: "c-coffee", name: "Coffee", kind: "discretionary", source: "custom" } });
    recategorizeTransactionMock.mockResolvedValue({ ok: true, count: 5 });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Starbucks")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Starbucks/ }));
    fireEvent.click(await screen.findByText("+ New category"));
    // the create form itself offers the remember option (merchant known)
    fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByLabelText(/Always categorize Starbucks this way/));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createCategoryMock).toHaveBeenCalledWith("Coffee", "discretionary"));
    // created → assigned as a RULE (applyToMerchant: true), not a one-off
    await waitFor(() =>
      expect(recategorizeTransactionMock).toHaveBeenCalledWith({ dedupKey: "dk-1", categoryId: "c-coffee", applyToMerchant: true }),
    );
  });

  it("a failed recategorize keeps the prior category + shows a discriminated error (AC6)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Costco", description: "x", amount: 520, category: "FOOD_AND_DRINK" },
      ],
      total: 520,
    });
    recategorizeTransactionMock.mockResolvedValue({ ok: false, error: "network" });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Costco")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Costco/ }));
    fireEvent.click(await screen.findByText("Rent"));
    // the offline error surfaces; no success toast (item keeps its category)
    expect(await screen.findByText(/try again when you're back/)).toBeTruthy();
    expect(screen.queryByText("Moved to Rent")).toBeNull();
  });

  it("remember the merchant → POSTs applyToMerchant: true and names the count (WLT-22-3)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Starbucks", description: "x", amount: 12, category: "FOOD_AND_DRINK" },
      ],
      total: 12,
    });
    recategorizeTransactionMock.mockResolvedValue({ ok: true, count: 4 });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Starbucks")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Starbucks/ }));
    // check "Always categorize Starbucks this way", then pick Rent
    fireEvent.click(await screen.findByLabelText(/Always categorize Starbucks this way/));
    fireEvent.click(await screen.findByText("Rent"));
    await waitFor(() =>
      expect(recategorizeTransactionMock).toHaveBeenCalledWith({ dedupKey: "dk-1", categoryId: "c-rent", applyToMerchant: true }),
    );
    // the counted success names the breadth (plural)
    expect(await screen.findByText("Now categorizing Starbucks as Rent — updated 4 transactions")).toBeTruthy();
  });

  it("no 'remember' checkbox for a transaction without a merchant (WLT-22-3)", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: null, description: "Cash withdrawal", amount: 40, category: "FOOD_AND_DRINK" },
      ],
      total: 40,
    });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(await screen.findByText("Cash withdrawal")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Cash withdrawal/ }));
    expect(await screen.findByText("Rent")).toBeTruthy(); // the picker opened…
    expect(screen.queryByLabelText(/Always categorize/)).toBeNull(); // …but no rule checkbox (no merchant)
  });

  it("the opened drill-down is a labelled region with semantic column headers", async () => {
    fetchCategoryTransactionsMock.mockResolvedValue({
      ok: true,
      items: [
        { dedupKey: "dk-1", occurredOn: "2026-06-14", merchant: "Trader Joe's", description: "x", amount: 520, category: "FOOD_AND_DRINK" },
      ],
      total: 520,
    });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    // labelled region (design: "the panel is a labelled region")
    const region = await screen.findByRole("region", { name: "Transactions in Food And Drink this month" });
    expect(region).toBeTruthy();
    // semantic column headers associate each amount with its date + merchant (+ the WLT-22-2 recategorize column).
    // findAllByRole WAITS for the table to render — the region appears in the loading state first, so a synchronous
    // getAllByRole here races the fetch→render (green locally, flaky on slower CI).
    const headers = await within(region).findAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Date", "Merchant", "Amount", "Category"]);
  });

  it("category_drilldown_viewed fires once per category per load — not on retry, refetch, or reopen", async () => {
    fetchCategoryTransactionsMock.mockResolvedValueOnce({ ok: false }); // open #1 errors
    render(<BudgetClient initial={VIEW} />);
    const toggle = () =>
      screen.getByRole("button", { name: /(Show|Hide) the transactions in Food And Drink this month/ });
    fireEvent.click(toggle()); // open → counts the view + fetches (errors)
    await waitFor(() => expect(screen.getByText("We couldn't load these just now — try again.")).toBeTruthy());
    expect(recordDrilldownViewedMock).toHaveBeenCalledTimes(1);
    // retry refetches but must NOT re-count the open
    fetchCategoryTransactionsMock.mockResolvedValueOnce({ ok: true, items: [], total: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("No transactions in Food And Drink this month.")).toBeTruthy());
    fireEvent.click(toggle()); // close
    fireEvent.click(toggle()); // reopen → still counted only once this load
    expect(recordDrilldownViewedMock).toHaveBeenCalledTimes(1);
  });

  it("drill-down loading → empty state", async () => {
    let resolve!: (v: { ok: true; items: unknown[]; total: number }) => void;
    fetchCategoryTransactionsMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    expect(screen.getByText("Loading your transactions…")).toBeTruthy(); // loading state
    resolve({ ok: true, items: [], total: 0 });
    await waitFor(() => expect(screen.getByText("No transactions in Food And Drink this month.")).toBeTruthy()); // empty state
  });

  it("drill-down error state shows a banner + retry that refetches", async () => {
    fetchCategoryTransactionsMock.mockResolvedValueOnce({ ok: false });
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }));
    await waitFor(() => expect(screen.getByText("We couldn't load these just now — try again.")).toBeTruthy());
    // retry refetches (this time succeeds)
    fetchCategoryTransactionsMock.mockResolvedValueOnce({
      ok: true,
      items: [{ dedupKey: "dk-1", occurredOn: "2026-06-10", merchant: "Costco", description: "x", amount: 520, category: "FOOD_AND_DRINK" }],
      total: 520,
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
  });

  it("no drill affordance for a category with no spend this month", () => {
    const view: BudgetViewDTO = {
      rows: [
        {
          category: "INSURANCE",
          label: "Insurance",
          recommended: null,
          actualThisMonth: 0,
          budget: { type: "amount", amount: 100 },
          effectiveCap: 100,
          status: "under",
        },
      ],
      asOfMonth: "2026-06",
      typicalMonthlyTotal: null,
      hasData: true,
      series: {},
      seriesMonths: [],
    };
    render(<BudgetClient initial={view} />);
    expect(screen.queryByRole("button", { name: /Show the transactions in Insurance/ })).toBeNull();
    expect(screen.getByText("$0.00")).toBeTruthy(); // the amount is plain text, not a button
  });

  it("the add-category picker adds a budgetable row", () => {
    render(<BudgetClient initial={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a category to budget" }));
    // pick a category not already shown (Food & Travel are present)
    fireEvent.click(screen.getByRole("button", { name: "Entertainment" }));
    expect(screen.getByText("Entertainment")).toBeTruthy(); // a new row appears
  });
});

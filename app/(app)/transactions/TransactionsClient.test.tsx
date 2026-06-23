// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TransactionRowDTO, TransactionsPageDTO } from "@/app/lib/transactions-client";

const fetchTransactionsMock = vi.fn();
const recordTransactionsFilteredMock = vi.fn();
vi.mock("@/app/lib/transactions-client", () => ({
  fetchTransactions: (p: unknown) => fetchTransactionsMock(p),
  recordTransactionsFiltered: () => recordTransactionsFilteredMock(),
}));
const fetchCategoriesMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    categories: [
      { id: "c1", name: "FOOD_AND_DRINK", kind: "discretionary", source: "seed", countsAsSpending: true },
      { id: "c2", name: "GROCERIES", kind: "essential", source: "seed", countsAsSpending: true },
    ],
  }),
);
const recategorizeTransactionMock = vi.fn<(p: unknown) => Promise<{ ok: boolean; count?: number }>>();
const createCategoryMock = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean }>>();
vi.mock("@/app/lib/budget-client", () => ({
  fetchCategories: () => fetchCategoriesMock(),
  recategorizeTransaction: (p: unknown) => recategorizeTransactionMock(p),
  createCategory: (...a: unknown[]) => createCategoryMock(...a),
}));
const markSubscriptionMock = vi.fn<(dk: string) => Promise<{ ok: boolean }>>();
const unmarkSubscriptionMock = vi.fn<(dk: string) => Promise<{ ok: boolean }>>();
vi.mock("@/app/lib/subscriptions-client", () => ({
  markSubscription: (dk: string) => markSubscriptionMock(dk),
  // WLT-24-3 — the ledger toggle now dismisses the charge's price series.
  unmarkSubscriptionFromLedger: (dk: string) => unmarkSubscriptionMock(dk),
}));
const flagFollowupMock = vi.fn<(dk: string) => Promise<{ ok: boolean }>>();
const resolveFollowupMock = vi.fn<(dk: string) => Promise<{ ok: boolean }>>();
vi.mock("@/app/lib/followups-client", () => ({
  flagFollowup: (dk: string) => flagFollowupMock(dk),
  resolveFollowup: (dk: string) => resolveFollowupMock(dk),
}));

import { TransactionsClient } from "./TransactionsClient";

// Headless UI (v2) — the WLT-23-3 in-row recategorize picker reaches for these
// browser APIs jsdom lacks (mirrors BudgetClient.test / shell.test).
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

const r = (over: Partial<TransactionRowDTO> & { id: string }): TransactionRowDTO => ({
  dedupKey: `dk-${over.id}`,
  occurredOn: "2026-06-15",
  merchant: "Blue Bottle",
  description: "BLUE BOTTLE COFFEE",
  amount: 5.5,
  direction: "debit",
  category: "FOOD_AND_DRINK",
  account: "Everyday Checking",
  pending: false,
  isSubscription: false,
  isFollowup: false,
  ...over,
});

const ROWS: TransactionRowDTO[] = [
  r({ id: "t1" }),
  r({ id: "t2", merchant: null, description: "PAYROLL DEPOSIT", amount: 2000, direction: "credit", category: "INCOME" }),
  r({ id: "t3", merchant: "Amazon", description: "AMZN", amount: 42, category: "", account: "Visa", pending: true }),
];

const ACCOUNTS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Everyday Checking" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Visa" },
];

function page(over: Partial<TransactionsPageDTO> = {}): TransactionsPageDTO {
  return { rows: ROWS, nextCursor: "CUR1", hasAccount: true, accounts: ACCOUNTS, hasOther: true, ...over };
}

afterEach(() => {
  fetchTransactionsMock.mockReset();
  recordTransactionsFilteredMock.mockReset();
  fetchCategoriesMock.mockClear();
  recategorizeTransactionMock.mockReset();
  createCategoryMock.mockReset();
});

describe("TransactionsClient — ledger render (AC2/AC3)", () => {
  it("renders all-accounts rows: merchant-or-description, signed amount, resolved category, account", () => {
    render(<TransactionsClient initial={page()} initialError={false} />);
    // merchant present
    expect(screen.getByText("Blue Bottle")).toBeTruthy();
    // merchant null → description
    expect(screen.getByText("PAYROLL DEPOSIT")).toBeTruthy();
    // debit bare, credit with "+"
    expect(screen.getByText("$5.50")).toBeTruthy();
    expect(screen.getByText("+$2,000.00")).toBeTruthy();
    // resolved category humanized; "" → Other (scope to the table — "Other"/"Visa"
    // also appear as filter-dropdown options)
    const table = screen.getByRole("table", { name: "Your transactions" });
    expect(within(table).getByText("Food And Drink")).toBeTruthy();
    expect(within(table).getByText("Income")).toBeTruthy();
    expect(within(table).getByText("Other")).toBeTruthy();
    // account name
    expect(within(table).getAllByText("Everyday Checking").length).toBeGreaterThan(0);
    expect(within(table).getByText("Visa")).toBeTruthy();
    // pending badge on the pending row
    expect(screen.getByText("Pending")).toBeTruthy();
    // result count
    expect(screen.getByText("Showing 3 transactions")).toBeTruthy();
  });

  it("gives credits an accessible 'credit' label", () => {
    render(<TransactionsClient initial={page()} initialError={false} />);
    expect(screen.getByLabelText("+$2,000.00 credit")).toBeTruthy();
  });
});

describe("TransactionsClient — pagination (AC4)", () => {
  it("Load more appends the next keyset page and then shows end-of-list", async () => {
    fetchTransactionsMock.mockResolvedValueOnce({
      ok: true,
      page: { rows: [r({ id: "t4", merchant: "Costco", description: "COSTCO" })], nextCursor: null, hasAccount: true },
    });
    render(<TransactionsClient initial={page()} initialError={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Load more transactions" }));

    await waitFor(() => expect(screen.getByText("Costco")).toBeTruthy());
    expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: "CUR1", accountId: null, category: null, q: "", followup: false });
    // nextCursor now null → the end marker replaces the button
    expect(screen.getByText("You're all caught up — that's everything.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more transactions" })).toBeNull();
  });

  it("shows end-of-list (no Load more) when the first page has no next cursor", () => {
    render(<TransactionsClient initial={page({ nextCursor: null })} initialError={false} />);
    expect(screen.queryByRole("button", { name: "Load more transactions" })).toBeNull();
    expect(screen.getByText("You're all caught up — that's everything.")).toBeTruthy();
  });

  it("surfaces a Load-more failure with a retry (never a silent blank)", async () => {
    fetchTransactionsMock.mockResolvedValueOnce({ ok: false });
    render(<TransactionsClient initial={page()} initialError={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more transactions" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});

describe("TransactionsClient — search (AC5)", () => {
  it("debounced search refetches with q and renders the matches", async () => {
    fetchTransactionsMock.mockResolvedValueOnce({
      ok: true,
      page: { rows: [r({ id: "t3", merchant: "Amazon", description: "AMZN", category: "" })], nextCursor: null, hasAccount: true },
    });
    render(<TransactionsClient initial={page()} initialError={false} />);

    fireEvent.change(screen.getByLabelText("Search your transactions by merchant or description"), {
      target: { value: "amazon" },
    });

    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: null, accountId: null, category: null, q: "amazon", followup: false }));
    await waitFor(() => expect(screen.getByText("Amazon")).toBeTruthy());
    expect(screen.queryByText("Blue Bottle")).toBeNull();
  });

  it("shows the no-match state (search stays editable to recover)", async () => {
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: { rows: [], nextCursor: null, hasAccount: true } });
    render(<TransactionsClient initial={page()} initialError={false} />);

    fireEvent.change(screen.getByLabelText("Search your transactions by merchant or description"), {
      target: { value: "zzz" },
    });
    await waitFor(() => expect(screen.getByText('No transactions match “zzz”.')).toBeTruthy());
    // the search box is still there
    expect(screen.getByLabelText("Search your transactions by merchant or description")).toBeTruthy();
  });
});

describe("TransactionsClient — empty + error states (AC6)", () => {
  it("no connected account → the connect nudge with a CTA", () => {
    render(<TransactionsClient initial={page({ rows: [], nextCursor: null, hasAccount: false })} initialError={false} />);
    expect(screen.getByText("No transactions yet")).toBeTruthy();
    const cta = screen.getByText("Connect an account");
    expect(cta.getAttribute("href")).toBe("/accounts");
  });

  it("connected but no rows → the calm 'nothing yet' state (no CTA)", () => {
    render(<TransactionsClient initial={page({ rows: [], nextCursor: null, hasAccount: true })} initialError={false} />);
    expect(screen.getByText("Nothing to show yet")).toBeTruthy();
    expect(screen.queryByText("Connect an account")).toBeNull();
  });

  it("a first-page read failure shows an error + retry that refetches", async () => {
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: page() });
    render(<TransactionsClient initial={null} initialError={true} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: null, accountId: null, category: null, q: "", followup: false }));
    await waitFor(() => expect(screen.getByText("Blue Bottle")).toBeTruthy());
  });
});

describe("TransactionsClient — filters (AC1/AC3/AC5/AC7)", () => {
  it("the account filter scopes the read; the category filter scopes by resolved category; both fire transactions_filtered", async () => {
    render(<TransactionsClient initial={page()} initialError={false} />);

    // Account filter → refetch with the selected accountId.
    fetchTransactionsMock.mockResolvedValueOnce({
      ok: true,
      page: { rows: [r({ id: "v1", merchant: "Costco", description: "C", account: "Visa" })], nextCursor: null, hasAccount: true, accounts: ACCOUNTS },
    });
    fireEvent.change(screen.getByLabelText("Filter by account"), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    await waitFor(() =>
      expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: null, accountId: "22222222-2222-4222-8222-222222222222", category: null, q: "", followup: false }),
    );
    expect(recordTransactionsFilteredMock).toHaveBeenCalledTimes(1);

    // Category filter → refetch with the resolved category name (raw, not humanized).
    fetchTransactionsMock.mockResolvedValueOnce({
      ok: true,
      page: { rows: [r({ id: "f1" })], nextCursor: null, hasAccount: true, accounts: ACCOUNTS },
    });
    await screen.findByRole("option", { name: "Food And Drink" }); // wait for the async category options (flaky in CI otherwise)
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "FOOD_AND_DRINK" } });
    await waitFor(() =>
      expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: null, accountId: "22222222-2222-4222-8222-222222222222", category: "FOOD_AND_DRINK", q: "", followup: false }),
    );
    expect(recordTransactionsFilteredMock).toHaveBeenCalledTimes(2);
  });

  it("an active filter with no matches shows the filtered-empty state (distinct from search-empty)", async () => {
    render(<TransactionsClient initial={page()} initialError={false} />);
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: { rows: [], nextCursor: null, hasAccount: true, accounts: ACCOUNTS } });
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "FOOD_AND_DRINK" } });
    await waitFor(() => expect(screen.getByText("No transactions match these filters.")).toBeTruthy());
  });

  it("a sparse category filter does NOT strand matches: auto-continues past an empty page with a cursor (BLOCKER)", async () => {
    render(<TransactionsClient initial={page()} initialError={false} />);
    await screen.findByRole("option", { name: "Food And Drink" }); // wait for the category options to load
    // First filtered page: empty but MORE to scan (the scan cap was hit) → must not
    // show a false "no matches"; the client auto-continues to the next page.
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: { rows: [], nextCursor: "C2", hasAccount: true, accounts: ACCOUNTS, hasOther: true } });
    fetchTransactionsMock.mockResolvedValueOnce({
      ok: true,
      page: { rows: [r({ id: "deep1", merchant: "Deep Match", description: "D" })], nextCursor: null, hasAccount: true, accounts: ACCOUNTS, hasOther: true },
    });
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "FOOD_AND_DRINK" } });
    // the row from page 2 renders; the false "no matches" never shows
    await waitFor(() => expect(screen.getByText("Deep Match")).toBeTruthy());
    expect(screen.queryByText("No transactions match these filters.")).toBeNull();
    // the second fetch used the continuation cursor C2
    expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: "C2", accountId: null, category: "FOOD_AND_DRINK", q: "", followup: false });
  });

  it("renders the 'Other' category option only when the user has a null-category bucket (hasOther)", () => {
    const { unmount } = render(<TransactionsClient initial={page({ hasOther: false })} initialError={false} />);
    const select = screen.getByLabelText("Filter by category") as HTMLSelectElement;
    expect([...select.options].some((o) => o.value === "")).toBe(false); // no "Other" option
    unmount();
    render(<TransactionsClient initial={page({ hasOther: true })} initialError={false} />);
    const select2 = screen.getByLabelText("Filter by category") as HTMLSelectElement;
    expect([...select2.options].some((o) => o.value === "" && o.text === "Other")).toBe(true);
  });

  it("Clear resets the filters and refetches the unfiltered first page", async () => {
    render(<TransactionsClient initial={page()} initialError={false} />);
    // apply a filter
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: { rows: [r({ id: "f1" })], nextCursor: null, hasAccount: true, accounts: ACCOUNTS } });
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "FOOD_AND_DRINK" } });
    await waitFor(() => expect(screen.getByText("Clear filters")).toBeTruthy());
    // clear → unfiltered refetch
    fetchTransactionsMock.mockResolvedValueOnce({ ok: true, page: page({ nextCursor: null }) });
    fireEvent.click(screen.getByText("Clear filters"));
    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenLastCalledWith({ cursor: null, accountId: null, category: null, q: "", followup: false }));
  });
});

describe("TransactionsClient — recategorize from the row (WLT-23-3)", () => {
  it("picking a category POSTs the row's dedupKey, updates the row, and acknowledges (AC1/AC4)", async () => {
    recategorizeTransactionMock.mockResolvedValue({ ok: true, count: 1 });
    render(<TransactionsClient initial={page()} initialError={false} />);
    // open the picker on row t1 (Blue Bottle, currently Food And Drink)
    const trigger = await screen.findByRole("button", { name: /Change the category of Blue Bottle/ });
    fireEvent.click(trigger);
    // move it to Groceries
    fireEvent.click(await screen.findByRole("menuitem", { name: "Groceries" }));
    await waitFor(() =>
      expect(recategorizeTransactionMock).toHaveBeenCalledWith({ dedupKey: "dk-t1", categoryId: "c2", applyToMerchant: false }),
    );
    // single-move acknowledgment + the row now reads Groceries (no full refetch needed)
    await waitFor(() => expect(screen.getByText("Moved to Groceries")).toBeTruthy());
    expect(fetchTransactionsMock).not.toHaveBeenCalled(); // a single move reconciles in place, no page refetch
  });

  it("WLT-24-1 — the 'Mark as a subscription' action lives IN the row's popover (AC2) and marks the row's dedupKey", async () => {
    markSubscriptionMock.mockResolvedValue({ ok: true });
    render(<TransactionsClient initial={page()} initialError={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Blue Bottle/ })); // the SAME reused popover
    // the action is a menuitem IN that popover (its a11y name names the merchant)
    const markItem = await screen.findByRole("menuitem", { name: "Mark Blue Bottle as a subscription" });
    fireEvent.click(markItem);
    await waitFor(() => expect(markSubscriptionMock).toHaveBeenCalledWith("dk-t1"));
    await waitFor(() => expect(screen.getByText("Marked as a subscription")).toBeTruthy());
  });

  it("WLT-25-1 — 'Follow up' lives in the row popover, flags the dedupKey, and shows the indicator", async () => {
    flagFollowupMock.mockResolvedValue({ ok: true });
    render(<TransactionsClient initial={page()} initialError={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Blue Bottle/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Flag Blue Bottle to follow up" }));
    await waitFor(() => expect(flagFollowupMock).toHaveBeenCalledWith("dk-t1"));
    await waitFor(() => expect(screen.getByText("Flagged to follow up")).toBeTruthy()); // toast
    expect(screen.getByLabelText("Flagged to follow up")).toBeTruthy(); // the per-row indicator
  });

  it("WLT-25-1 — the 'Follow up' action is offered on a credit row too (not subscription-only)", async () => {
    render(<TransactionsClient initial={page({ rows: [r({ id: "t1", direction: "credit" })] })} initialError={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Blue Bottle/ }));
    expect(await screen.findByRole("menuitem", { name: "Flag Blue Bottle to follow up" })).toBeTruthy();
    // subscriptions are debit-only → no subscription action on a credit row
    expect(screen.queryByRole("menuitem", { name: /as a subscription/ })).toBeNull();
  });

  it("WLT-25-1 — the Follow-ups filter fetches with followup=true", async () => {
    fetchTransactionsMock.mockResolvedValue({ ok: true, page: page({ rows: [r({ id: "t1", isFollowup: true })] }) });
    render(<TransactionsClient initial={page()} initialError={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Show only charges flagged to follow up" }));
    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledWith(expect.objectContaining({ followup: true })));
  });

  it("offers 'Always categorize this merchant' only when the row has a merchant (AC3 edge)", async () => {
    // a row WITH a merchant → the remember control is offered
    const { unmount } = render(<TransactionsClient initial={page({ rows: [r({ id: "t1" })] })} initialError={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of Blue Bottle/ }));
    expect(screen.getByText(/Always categorize/)).toBeTruthy();
    unmount();
    // a null-merchant row (labelled by its description) → no remember control
    render(<TransactionsClient initial={page({ rows: [r({ id: "t2", merchant: null, description: "PAYROLL DEPOSIT" })] })} initialError={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Change the category of PAYROLL DEPOSIT/ }));
    expect(screen.queryByText(/Always categorize/)).toBeNull();
  });
});

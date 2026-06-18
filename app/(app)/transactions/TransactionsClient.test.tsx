// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionRowDTO, TransactionsPageDTO } from "@/app/lib/transactions-client";

const fetchTransactionsMock = vi.fn();
vi.mock("@/app/lib/transactions-client", () => ({
  fetchTransactions: (p: unknown) => fetchTransactionsMock(p),
}));

import { TransactionsClient } from "./TransactionsClient";

const r = (over: Partial<TransactionRowDTO> & { id: string }): TransactionRowDTO => ({
  occurredOn: "2026-06-15",
  merchant: "Blue Bottle",
  description: "BLUE BOTTLE COFFEE",
  amount: 5.5,
  direction: "debit",
  category: "FOOD_AND_DRINK",
  account: "Everyday Checking",
  pending: false,
  ...over,
});

const ROWS: TransactionRowDTO[] = [
  r({ id: "t1" }),
  r({ id: "t2", merchant: null, description: "PAYROLL DEPOSIT", amount: 2000, direction: "credit", category: "INCOME" }),
  r({ id: "t3", merchant: "Amazon", description: "AMZN", amount: 42, category: "", account: "Visa", pending: true }),
];

function page(over: Partial<TransactionsPageDTO> = {}): TransactionsPageDTO {
  return { rows: ROWS, nextCursor: "CUR1", hasAccount: true, ...over };
}

afterEach(() => {
  fetchTransactionsMock.mockReset();
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
    // resolved category humanized; "" → Other
    expect(screen.getByText("Food And Drink")).toBeTruthy();
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    // account name
    expect(screen.getAllByText("Everyday Checking").length).toBeGreaterThan(0);
    expect(screen.getByText("Visa")).toBeTruthy();
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
    expect(fetchTransactionsMock).toHaveBeenCalledWith({ cursor: "CUR1", q: "" });
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

    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledWith({ q: "amazon" }));
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
    await waitFor(() => expect(fetchTransactionsMock).toHaveBeenCalledWith({ q: "" }));
    await waitFor(() => expect(screen.getByText("Blue Bottle")).toBeTruthy());
  });
});

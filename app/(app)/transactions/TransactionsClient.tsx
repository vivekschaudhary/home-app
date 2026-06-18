"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { humanizeCategory } from "@wealth/core";
import { Button } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";
import {
  type TransactionRowDTO,
  type TransactionsPageDTO,
  fetchTransactions,
} from "@/app/lib/transactions-client";

const C = COPY.transactions;
const A = COPY.transactionsA11y;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function shortDate(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const y = iso.slice(0, 4);
  return `${MONTHS[m - 1] ?? ""} ${d}, ${y}`;
}
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// The amount as the user sees it: a credit (income / refund / transfer-in) renders
// with a leading "+"; a debit is the bare amount. The accessible label appends
// "credit" so a screen reader never hears an ambiguous number.
function amountDisplay(row: TransactionRowDTO): string {
  return row.direction === "credit" ? `+${money(row.amount)}` : money(row.amount);
}
function amountLabel(row: TransactionRowDTO): string {
  const a = amountDisplay(row);
  return row.direction === "credit" ? fill(A.creditAmount, { amount: a }) : fill(A.debitAmount, { amount: a });
}

type Mode = "idle" | "loadingPage" | "loadingMore";

export function TransactionsClient({
  initial,
  initialError,
}: {
  initial: TransactionsPageDTO | null;
  initialError: boolean;
}) {
  const [rows, setRows] = useState<TransactionRowDTO[]>(initial?.rows ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [hasAccount, setHasAccount] = useState<boolean>(initial?.hasAccount ?? false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [pageError, setPageError] = useState<boolean>(initialError);
  const [moreError, setMoreError] = useState(false);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const didMount = useRef(false);

  // Replace the list with a fresh first page for the current search.
  const loadPage = useCallback(async (q: string) => {
    setMode("loadingPage");
    setPageError(false);
    setMoreError(false);
    const res = await fetchTransactions({ q });
    if (!res.ok) {
      setMode("idle");
      setPageError(true);
      return;
    }
    setRows(res.page.rows);
    setNextCursor(res.page.nextCursor);
    setHasAccount(res.page.hasAccount);
    setMode("idle");
  }, []);

  // Append the next keyset page; move focus to the first newly-loaded row.
  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setMode("loadingMore");
    setMoreError(false);
    const res = await fetchTransactions({ cursor: nextCursor, q: query });
    if (!res.ok) {
      setMode("idle");
      setMoreError(true);
      return;
    }
    setRows((prev) => [...prev, ...res.page.rows]);
    setNextCursor(res.page.nextCursor);
    setFocusRowId(res.page.rows[0]?.id ?? null);
    setMode("idle");
  }, [nextCursor, query]);

  // Debounced search — skip the very first run (the server-rendered initial page).
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(() => void loadPage(query), 300);
    return () => clearTimeout(t);
  }, [query, loadPage]);

  // After Load-more appends, move keyboard focus into the first new row.
  useEffect(() => {
    if (focusRowId) document.getElementById(`txn-cell-${focusRowId}`)?.focus();
  }, [focusRowId]);

  const searching = query.trim().length > 0;
  const showList = rows.length > 0;
  const showLoading = mode === "loadingPage";

  return (
    <div className="mt-6">
      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={C.searchPlaceholder}
          aria-label={A.search}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
        {showList ? (
          <p aria-live="polite" className="mt-1 text-xs text-gray-500">
            {fill(C.resultCount, { count: String(rows.length) })}
          </p>
        ) : null}
      </div>

      {showLoading ? (
        <p aria-busy="true" className="py-8 text-center text-sm text-gray-500">
          {C.loading}
        </p>
      ) : pageError ? (
        <p role="alert" className="py-8 text-center text-sm text-red-600">
          {C.error}{" "}
          <button type="button" onClick={() => void loadPage(query)} className="underline">
            {C.retry}
          </button>
        </p>
      ) : showList ? (
        <>
          <table className="w-full border-collapse text-sm" aria-label={A.list}>
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th scope="col" className="py-2 pr-4 font-medium">{C.colDate}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{C.colMerchant}</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">{C.colAmount}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{C.colCategory}</th>
                <th scope="col" className="py-2 font-medium">{C.colAccount}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="block border-b border-gray-200 py-3 md:table-row md:py-0">
                  <td
                    id={`txn-cell-${r.id}`}
                    tabIndex={-1}
                    className="block py-0.5 text-gray-600 md:table-cell md:py-3 md:pr-4 md:whitespace-nowrap"
                  >
                    <span className="mr-2 text-xs uppercase text-gray-400 md:hidden">{C.colDate}</span>
                    {shortDate(r.occurredOn)}
                  </td>
                  <td className="block py-0.5 text-base font-medium text-gray-900 md:table-cell md:py-3 md:pr-4 md:text-sm md:font-normal">
                    {r.merchant || r.description}
                    {r.pending ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 align-middle text-xs font-medium text-amber-700">
                        {C.pending}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`block py-0.5 md:table-cell md:py-3 md:pr-4 md:text-right ${
                      r.direction === "credit" ? "text-emerald-700" : "text-gray-900"
                    }`}
                    aria-label={amountLabel(r)}
                  >
                    <span className="mr-2 text-xs uppercase text-gray-400 md:hidden">{C.colAmount}</span>
                    {amountDisplay(r)}
                    {r.direction === "credit" ? <span className="sr-only"> credit</span> : null}
                  </td>
                  <td className="block py-0.5 text-gray-600 md:table-cell md:py-3 md:pr-4">
                    <span className="mr-2 text-xs uppercase text-gray-400 md:hidden">{C.colCategory}</span>
                    {humanizeCategory(r.category || null)}
                  </td>
                  <td className="block py-0.5 text-gray-600 md:table-cell md:py-3">
                    <span className="mr-2 text-xs uppercase text-gray-400 md:hidden">{C.colAccount}</span>
                    {r.account || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Load more / end-of-list */}
          <div className="mt-5 text-center">
            {moreError ? (
              <p role="alert" className="text-sm text-red-600">
                {C.error}{" "}
                <button type="button" onClick={() => void loadMore()} className="underline">
                  {C.retry}
                </button>
              </p>
            ) : nextCursor ? (
              <Button
                variant="secondary"
                onClick={() => void loadMore()}
                loading={mode === "loadingMore"}
                loadingLabel={C.loadingMore}
                aria-label={A.loadMore}
                className="w-auto"
              >
                {C.loadMore}
              </Button>
            ) : (
              <p className="text-sm text-gray-400">{C.endOfList}</p>
            )}
          </div>
        </>
      ) : searching ? (
        // Empty — search returned nothing (the search stays editable to recover).
        <p className="py-8 text-center text-sm text-gray-600">{fill(C.emptySearch, { query: query.trim() })}</p>
      ) : !hasAccount ? (
        // Empty — no connected account (the only state with a call-to-action).
        <div className="mt-8 rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <h2 className="text-base font-semibold text-gray-900">{C.emptyNoAccountTitle}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{C.emptyNoAccountBody}</p>
          <Link href="/accounts" className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            {C.emptyNoAccountCta}
          </Link>
        </div>
      ) : (
        // Empty — connected, but no transactions yet (may still be syncing).
        <div className="mt-8 rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <h2 className="text-base font-semibold text-gray-900">{C.emptyNoneTitle}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{C.emptyNoneBody}</p>
        </div>
      )}
    </div>
  );
}

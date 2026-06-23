"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { humanizeCategory } from "@wealth/core";
import { Button, Toast } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";
import { type CategoryDTO, createCategory, fetchCategories, recategorizeTransaction } from "@/app/lib/budget-client";
import { CategoryPicker, type CreateResult, type RecatResult } from "@/app/(app)/budget/CategoryPicker";
import {
  type LedgerAccountDTO,
  type TransactionRowDTO,
  type TransactionsPageDTO,
  fetchTransactions,
  recordTransactionsFiltered,
} from "@/app/lib/transactions-client";
import { markSubscription, unmarkSubscriptionFromLedger } from "@/app/lib/subscriptions-client";
import { flagFollowup, resolveFollowup } from "@/app/lib/followups-client";

const C = COPY.transactions;
const A = COPY.transactionsA11y;
const SUB = COPY.subscriptions;
const SUBA = COPY.subscriptionsA11y;
const FU = COPY.followups;
const FUA = COPY.followupsA11y;

// Select sentinel for the "all" (unfiltered) option — distinct from a real account
// id (uuid) and from the "" category value (the null-category "Other" bucket).
const ALL = "__all__";
// Auto-continue through empty filtered pages (the resolved-category scan can return
// an empty page with a continuation cursor when its scan cap is hit) so matches are
// never stranded behind an unreachable cursor — bounded so a zero-match filter can't
// fetch forever; beyond it the user keeps paging manually.
const AUTO_SCAN_LIMIT = 8;

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
  const [accounts, setAccounts] = useState<LedgerAccountDTO[]>(initial?.accounts ?? []);
  const [hasOther, setHasOther] = useState<boolean>(initial?.hasOther ?? false);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = all, "" = Other
  const [followupFilter, setFollowupFilter] = useState(false); // WLT-25-1 — show only open follow-ups
  const [mode, setMode] = useState<Mode>("idle");
  const [pageError, setPageError] = useState<boolean>(initialError);
  const [moreError, setMoreError] = useState(false);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // WLT-24-1 — mark / unmark a recurring charge as a subscription, from the row's
  // existing popover (AC2). Orthogonal to category — never touches the row's
  // category/budget. No optimistic revert: the row flips only on success.
  async function toggleSubscription(r: TransactionRowDTO) {
    const res = r.isSubscription ? await unmarkSubscriptionFromLedger(r.dedupKey) : await markSubscription(r.dedupKey);
    if (!res.ok) {
      setToast(res.error === "network" ? SUB.errorNetwork : res.error === "invalid" ? SUB.errorInvalid : SUB.error);
      return;
    }
    setRows((rs) => rs.map((x) => (x.dedupKey === r.dedupKey ? { ...x, isSubscription: !r.isSubscription } : x)));
    setToast(r.isSubscription ? SUB.unmarkedToast : SUB.markedToast);
  }

  // WLT-25-1 — flag / resolve a charge "follow up", from the same row popover.
  // Per-charge, orthogonal to category AND subscription. No optimistic revert.
  async function toggleFollowup(r: TransactionRowDTO) {
    const res = r.isFollowup ? await resolveFollowup(r.dedupKey) : await flagFollowup(r.dedupKey);
    if (!res.ok) {
      setToast(res.error === "network" ? FU.errorNetwork : res.error === "invalid" ? FU.errorInvalid : FU.error);
      return;
    }
    // If the Follow-ups filter is on, a resolved row leaves the list; else flip in place.
    setRows((rs) =>
      followupFilter && r.isFollowup
        ? rs.filter((x) => x.dedupKey !== r.dedupKey)
        : rs.map((x) => (x.dedupKey === r.dedupKey ? { ...x, isFollowup: !r.isFollowup } : x)),
    );
    setToast(r.isFollowup ? FU.resolvedToast : FU.flaggedToast);
  }
  const didMount = useRef(false);

  // Replace the list with a fresh first page for the current filters + search.
  // Auto-continues through empty filtered pages (bounded) so a sparse category
  // filter never strands matches behind the scan cap's continuation cursor.
  const loadPage = useCallback(
    async (f: { accountId: string | null; category: string | null; q: string; followup: boolean }) => {
      setMode("loadingPage");
      setPageError(false);
      setMoreError(false);
      let cursor: string | null = null;
      for (let i = 0; i < AUTO_SCAN_LIMIT; i++) {
        const res = await fetchTransactions({ cursor, accountId: f.accountId, category: f.category, q: f.q, followup: f.followup });
        if (!res.ok) {
          setMode("idle");
          setPageError(true);
          return;
        }
        // Stop on the first non-empty page, when the data is exhausted, or at the cap.
        if (res.page.rows.length > 0 || res.page.nextCursor === null || i === AUTO_SCAN_LIMIT - 1) {
          setRows(res.page.rows);
          setNextCursor(res.page.nextCursor);
          setHasAccount(res.page.hasAccount);
          setAccounts(res.page.accounts ?? []);
          setHasOther(res.page.hasOther ?? false);
          setMode("idle");
          return;
        }
        cursor = res.page.nextCursor; // empty page but more to scan → keep going
      }
    },
    [],
  );

  // Append the next keyset page (within the active filters); focus the first new row.
  // Same bounded auto-continue past empty filtered pages.
  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setMode("loadingMore");
    setMoreError(false);
    let cursor: string | null = nextCursor;
    for (let i = 0; i < AUTO_SCAN_LIMIT; i++) {
      const res = await fetchTransactions({ cursor, accountId, category: categoryFilter, q: debouncedQuery, followup: followupFilter });
      if (!res.ok) {
        setMode("idle");
        setMoreError(true);
        return;
      }
      if (res.page.rows.length > 0 || res.page.nextCursor === null || i === AUTO_SCAN_LIMIT - 1) {
        if (res.page.rows.length > 0) {
          setRows((prev) => [...prev, ...res.page.rows]);
          setFocusRowId(res.page.rows[0]?.id ?? null);
        }
        setNextCursor(res.page.nextCursor);
        setMode("idle");
        return;
      }
      cursor = res.page.nextCursor;
    }
  }, [nextCursor, accountId, categoryFilter, debouncedQuery, followupFilter]);

  // Debounce the search box → a settled value the load effect watches.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // One effect drives page-1 reloads: filters change → fires immediately (the
  // debounced query is unchanged); search → fires when the debounce settles. Skips
  // the first run (the server-rendered initial page).
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    void loadPage({ accountId, category: categoryFilter, q: debouncedQuery, followup: followupFilter });
  }, [accountId, categoryFilter, debouncedQuery, followupFilter, loadPage]);

  // The category-filter options (the user's categories) — fetched once on mount.
  // Also the option set the in-row recategorize picker (WLT-23-3) chooses from.
  useEffect(() => {
    void (async () => {
      const res = await fetchCategories();
      if (res.ok) setCategories(res.categories);
    })();
  }, []);

  // WLT-23-3 — recategorize a transaction from its row (the reused WLT-22 picker).
  // Keep the prior category until success (the picker shows saving/error); on
  // success reconcile: a single move updates the row in place (and drops it if it
  // no longer matches an active category filter); a "remember the merchant" rule
  // can move many rows → refetch the current page.
  const handleRecat = useCallback(
    async (row: TransactionRowDTO, categoryId: string, applyToMerchant: boolean): Promise<RecatResult> => {
      const res = await recategorizeTransaction({ dedupKey: row.dedupKey, categoryId, applyToMerchant });
      if (!res.ok) return res;
      if (applyToMerchant) {
        await loadPage({ accountId, category: categoryFilter, q: debouncedQuery, followup: followupFilter });
      } else {
        const newName = categories.find((c) => c.id === categoryId)?.name ?? "";
        setToast(fill(C.recatSaved, { category: humanizeCategory(newName || null) }));
        setRows((prev) =>
          prev.flatMap((rrow) => {
            if (rrow.id !== row.id) return [rrow];
            // Drop the row if it no longer matches an active category filter.
            if (categoryFilter !== null && newName !== categoryFilter) return [];
            return [{ ...rrow, category: newName }];
          }),
        );
      }
      return res;
    },
    [categories, accountId, categoryFilter, debouncedQuery, followupFilter, loadPage],
  );

  const createCat = useCallback(async (name: string, kind: "essential" | "discretionary"): Promise<CreateResult> => {
    const res = await createCategory(name, kind);
    if (res.ok) setCategories((cs) => [...cs, res.category].sort((a, b) => a.name.localeCompare(b.name)));
    return res;
  }, []);

  // After Load-more appends, move keyboard focus into the first new row.
  useEffect(() => {
    if (focusRowId) document.getElementById(`txn-cell-${focusRowId}`)?.focus();
  }, [focusRowId]);

  function onAccountChange(value: string) {
    setAccountId(value === ALL ? null : value);
    recordTransactionsFiltered();
  }
  function onCategoryChange(value: string) {
    setCategoryFilter(value === ALL ? null : value);
    recordTransactionsFiltered();
  }
  function onFollowupChange(next: boolean) {
    setFollowupFilter(next);
    recordTransactionsFiltered();
  }
  function clearFilters() {
    setAccountId(null);
    setCategoryFilter(null);
    setFollowupFilter(false);
    setQuery("");
    setDebouncedQuery("");
  }

  const filtersActive = accountId !== null || categoryFilter !== null || followupFilter;
  const searchActive = debouncedQuery.trim().length > 0;
  const anyActive = filtersActive || searchActive;
  const showList = rows.length > 0;
  const showLoading = mode === "loadingPage";

  return (
    <div className="mt-6">
      {/* Filters + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={C.searchPlaceholder}
          aria-label={A.search}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 sm:max-w-xs"
        />
        <select
          value={accountId ?? ALL}
          onChange={(e) => onAccountChange(e.target.value)}
          aria-label={A.accountFilter}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
        >
          <option value={ALL}>{C.allAccounts}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter ?? ALL}
          onChange={(e) => onCategoryChange(e.target.value)}
          aria-label={A.categoryFilter}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
        >
          <option value={ALL}>{C.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{humanizeCategory(c.name)}</option>
          ))}
          {hasOther ? <option value="">{humanizeCategory("")}</option> : null}
        </select>
        {/* WLT-25-1 — the Follow-ups filter: show only open follow-ups. */}
        <button
          type="button"
          onClick={() => onFollowupChange(!followupFilter)}
          aria-pressed={followupFilter}
          aria-label={FUA.filterA11y}
          title={FU.filterHint}
          className={`rounded-md border px-3 py-2 text-sm ${
            followupFilter ? "border-amber-400 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-700"
          }`}
        >
          {FU.filterLabel}
        </button>
        {anyActive ? (
          <button
            type="button"
            onClick={clearFilters}
            aria-label={A.clearFilters}
            className="text-sm text-gray-500 underline"
          >
            {C.clearFilters}
          </button>
        ) : null}
      </div>
      {showList ? (
        <p aria-live="polite" className="mb-2 text-xs text-gray-500">
          {fill(C.resultCount, { count: String(rows.length) })}
        </p>
      ) : null}

      {showLoading ? (
        <p aria-busy="true" className="py-8 text-center text-sm text-gray-500">
          {C.loading}
        </p>
      ) : pageError ? (
        <p role="alert" className="py-8 text-center text-sm text-red-600">
          {C.error}{" "}
          <button type="button" onClick={() => void loadPage({ accountId, category: categoryFilter, q: debouncedQuery, followup: followupFilter })} className="underline">
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
                    {/* WLT-24-1 — a non-interactive marked indicator; the mark/unmark
                        ACTION lives in the row popover below (AC2). */}
                    {r.isSubscription ? (
                      <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 align-middle text-xs font-medium text-indigo-700">
                        ★ {SUB.markIndicator}
                      </span>
                    ) : null}
                    {/* WLT-25-1 — the follow-up indicator (distinct glyph + colour from
                        the subscription ★); the flag/resolve ACTION lives in the popover. */}
                    {r.isFollowup ? (
                      <span
                        className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 align-middle text-xs font-medium text-amber-700"
                        aria-label={FUA.indicatorA11y}
                      >
                        ⚑ {FU.indicator}
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
                    {/* WLT-23-3 — the reused WLT-22 picker (popover): move · create · remember. */}
                    <CategoryPicker
                      current={r.category}
                      merchantLabel={r.merchant || r.description}
                      amount={money(r.amount)}
                      categories={categories}
                      canRemember={!!r.merchant}
                      onPick={(categoryId, applyToMerchant) => handleRecat(r, categoryId, applyToMerchant)}
                      onCreate={createCat}
                      extraActions={[
                        // Subscriptions are debit-only; a follow-up applies to any charge.
                        ...(r.direction === "debit"
                          ? [
                              {
                                key: "subscription",
                                label: r.isSubscription ? SUB.unmarkAction : SUB.markAction,
                                a11yLabel: fill(r.isSubscription ? SUBA.unmarkA11y : SUBA.markA11y, {
                                  merchant: r.merchant || r.description,
                                }),
                                pressed: r.isSubscription,
                                onSelect: () => toggleSubscription(r),
                              },
                            ]
                          : []),
                        {
                          key: "followup",
                          label: r.isFollowup ? FU.resolveAction : FU.flagAction,
                          a11yLabel: fill(r.isFollowup ? FUA.resolveA11y : FUA.flagA11y, {
                            merchant: r.merchant || r.description,
                          }),
                          pressed: r.isFollowup,
                          onSelect: () => toggleFollowup(r),
                        },
                      ]}
                    />
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
      ) : nextCursor !== null ? (
        // No matches in what we've scanned so far, but more history remains (the
        // bounded category scan stopped at its cap) — keep the cursor reachable so
        // matches farther down are never stranded (never a false "no matches").
        <div className="py-8 text-center">
          <p className="text-sm text-gray-600">{C.emptyMoreToScan}</p>
          <div className="mt-4">
            {moreError ? (
              <p role="alert" className="text-sm text-red-600">
                {C.error}{" "}
                <button type="button" onClick={() => void loadMore()} className="underline">
                  {C.retry}
                </button>
              </p>
            ) : (
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
            )}
          </div>
        </div>
      ) : filtersActive ? (
        // WLT-25-1 — the Follow-ups filter alone with nothing open gets its own honest
        // nudge; any other filter combo gets the generic no-match line.
        followupFilter && accountId === null && categoryFilter === null && !searchActive ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-gray-900">{FU.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{FU.emptyBody}</p>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-600">{C.emptyFiltered}</p>
        )
      ) : searchActive ? (
        // Empty — search returned nothing (the search stays editable to recover).
        <p className="py-8 text-center text-sm text-gray-600">{fill(C.emptySearch, { query: debouncedQuery.trim() })}</p>
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

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

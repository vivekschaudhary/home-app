"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { BUDGETABLE_CATEGORIES, type BudgetRow, humanizeCategory } from "@wealth/core";
import { Banner, Button, TextField, Toast } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";
import {
  type BudgetViewDTO,
  type CategoryDTO,
  clearBudget,
  createCategory,
  fetchBudget,
  fetchCategories,
  fetchCategoryTransactions,
  recategorizeTransaction,
  recordDrilldownViewed,
  recordSpreadViewed,
  saveBudget,
} from "@/app/lib/budget-client";
import { CategoryTransactions, type DrillState } from "./CategoryTransactions";
import type { CreateResult, RecatResult } from "./CategoryPicker";
import { YearSpread } from "./YearSpread";

const C = COPY.budget;
const TR = COPY.budgetTransfers; // WLT-22-5
const TR_A = COPY.budgetTransfersA11y;
const NUDGE_KEY = "wlt22-5-transfers-nudge-dismissed"; // scoped per-user at runtime

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export function BudgetClient({ initial, userId, currency = "USD" }: { initial: BudgetViewDTO; userId: string; currency?: string }) {
  const [view, setView] = useState<BudgetViewDTO>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<"amount" | "percent">("amount");
  const [draftValue, setDraftValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]); // ephemeral picker-added (until saved)
  const [pickerOpen, setPickerOpen] = useState(false);
  const spreadViewed = useRef<Set<string>>(new Set()); // fire budget_spread_viewed once per category per load
  const [drillCache, setDrillCache] = useState<Record<string, DrillState>>({}); // fetch once per category per load
  const drillViewed = useRef<Set<string>>(new Set()); // categories already counted for category_drilldown_viewed this load (AC6)
  const [categories, setCategories] = useState<CategoryDTO[]>([]); // the user's category set for the recategorize picker (WLT-22-2)

  // Reconcile with live server state on mount (#36 — force-dynamic page can hand a
  // stale prefetch; trusting initial props forever is the bug).
  // WLT-27-5: forward currency so the refresh stays in the same region as the SSR data.
  const refresh = useCallback(async () => {
    const res = await fetchBudget(currency);
    if (res.ok) setView(res.view);
  }, [currency]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Server rows + any ephemeral picker-added (zero-history) categories.
  const rows = useMemo<BudgetRow[]>(() => {
    const present = new Set(view.rows.map((r) => r.category));
    const extra: BudgetRow[] = added
      .filter((c) => !present.has(c))
      .map((c) => ({
        category: c,
        label: humanizeCategory(c),
        recommended: null,
        actualThisMonth: 0,
        budget: null,
        effectiveCap: null,
        status: "none" as const,
        countsAsSpending: true, // picker-added categories are always spendable
      }));
    return [...view.rows, ...extra];
  }, [view.rows, added]);

  const pickerOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.category));
    return BUDGETABLE_CATEGORIES.filter((c) => !present.has(c));
  }, [rows]);

  // WLT-22-5 — split spend rows from the non-spending "Transfers & Payments" group.
  const spendRows = useMemo(() => rows.filter((r) => r.countsAsSpending), [rows]);
  const excludedRows = useMemo(() => rows.filter((r) => !r.countsAsSpending), [rows]);
  const excludedRef = useRef<HTMLDivElement>(null);
  // Per-USER key (not a single browser-wide flag) so one user's dismissal never
  // hides another user's nudge on a shared browser.
  const nudgeKey = `${NUDGE_KEY}:${userId}`;
  // Start HIDDEN (dismissed=true) and reveal only after we've read storage on the
  // client. The server can't know localStorage, so rendering it on first paint
  // would flash for a user who already dismissed it (the SSR/hydration mismatch).
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  useEffect(() => {
    try {
      setNudgeDismissed(localStorage.getItem(nudgeKey) === "1");
    } catch {
      setNudgeDismissed(false); // storage unavailable — show it (non-blocking)
    }
  }, [nudgeKey]);
  function dismissNudge() {
    setNudgeDismissed(true); // sticky — never re-nags
    try {
      localStorage.setItem(nudgeKey, "1");
    } catch {
      /* ignore */
    }
  }

  function startEdit(row: BudgetRow) {
    setEditing(row.category);
    setRowError(null);
    if (row.budget?.type === "percent") {
      setDraftType("percent");
      setDraftValue(String(row.budget.percent));
    } else if (row.budget?.type === "amount") {
      setDraftType("amount");
      setDraftValue(String(row.budget.amount));
    } else {
      setDraftType("amount");
      setDraftValue(row.recommended != null ? String(row.recommended) : "");
    }
  }
  function cancelEdit() {
    setEditing(null);
    setRowError(null);
  }

  // "Use this" — one tap to adopt the recommendation: open the editor with the
  // recommended dollar amount prefilled (design.md / copy.md useThis).
  function useRecommended(row: BudgetRow) {
    if (row.recommended == null) return;
    setEditing(row.category);
    setDraftType("amount");
    setDraftValue(String(row.recommended));
    setRowError(null);
  }

  async function save(category: string) {
    const num = Number(draftValue.trim());
    if (!draftValue.trim() || Number.isNaN(num)) {
      setRowError(draftType === "amount" ? COPY.budgetErrors.invalidAmount : COPY.budgetErrors.invalidPercent);
      return;
    }
    if (draftType === "amount" && !(num > 0)) {
      setRowError(COPY.budgetErrors.invalidAmount);
      return;
    }
    if (draftType === "percent" && !(num > 0 && num <= 100)) {
      setRowError(COPY.budgetErrors.invalidPercent);
      return;
    }
    setBusy(true);
    setRowError(null);
    const res = await saveBudget(draftType === "amount" ? { category, limitAmount: num } : { category, limitPercent: num });
    setBusy(false);
    if (!res.ok) {
      setRowError(res.error === "network" ? COPY.budgetErrors.network : COPY.budgetErrors.saveFailed);
      return; // input preserved (draftValue untouched)
    }
    setEditing(null);
    setToast(C.savedToast);
    await refresh();
  }

  async function clear(category: string) {
    setBusy(true);
    setRowError(null);
    const res = await clearBudget(category);
    setBusy(false);
    if (!res.ok) {
      setRowError(COPY.budgetErrors.saveFailed);
      return;
    }
    setEditing(null);
    setAdded((a) => a.filter((c) => c !== category));
    setToast(C.clearedToast);
    await refresh();
  }

  function addCategory(category: string) {
    setAdded((a) => (a.includes(category) ? a : [...a, category]));
    setPickerOpen(false);
    setEditing(category);
    setDraftType("amount");
    setDraftValue("");
    setRowError(null);
  }

  const C_Y = COPY.budgetYear;
  const A_Y = COPY.budgetYearA11y;
  const A_D = COPY.budgetDrillA11y;

  // WLT-22-1 — drill into a category's line items. BudgetClient owns the fetch +
  // cache so it fetches once per category per load (the GET emits the event once).
  // WLT-27-5: pass currency so the drill total reconciles to the budget row.
  const loadDrill = useCallback(
    async (category: string) => {
      setDrillCache((c) => ({ ...c, [category]: { status: "loading" } }));
      const res = await fetchCategoryTransactions(category, view.asOfMonth, currency);
      setDrillCache((c) => ({
        ...c,
        [category]: res.ok ? { status: "ok", items: res.items, total: res.total } : { status: "error" },
      }));
    },
    [view.asOfMonth, currency],
  );

  // WLT-22-2 — the user's categories for the recategorize picker. Fetched once on
  // mount (the GET seeds from the user's distinct provider categories).
  useEffect(() => {
    void (async () => {
      const res = await fetchCategories();
      if (res.ok) setCategories(res.categories);
    })();
  }, []);

  const recategorize = useCallback(
    async (sourceCategory: string, dedupKey: string, categoryId: string, applyToMerchant: boolean): Promise<RecatResult> => {
      const res = await recategorizeTransaction({ dedupKey, categoryId, applyToMerchant });
      if (!res.ok) return res;
      await refresh(); // budget rows reconcile (source drops, destination rises)
      if (!applyToMerchant) {
        // The single-move success is the "Moved to…" toast (a rule shows the
        // picker's own counted success — no toast, to avoid double feedback).
        // WLT-22-5 — name the spending EFFECT when moving in/out of the protected
        // bucket: excluded ("excluded from spending") vs back-in ("counts again").
        const dest = categories.find((c) => c.id === categoryId);
        const destName = humanizeCategory(dest?.name || null);
        const srcExcluded = categories.find((c) => c.name === sourceCategory)?.countsAsSpending === false;
        const msg =
          dest?.countsAsSpending === false
            ? COPY.budgetRecat.savedExcluded
            : srcExcluded
              ? fill(COPY.budgetRecat.savedIncluded, { category: destName })
              : fill(COPY.budgetRecat.saved, { category: destName });
        setToast(msg);
      }
      // Reconcile the line-item popovers: drop every cached drill (so any reopened
      // one refetches the moved item) and refetch the source — the popover the
      // user acted in — so it updates live.
      setDrillCache({});
      await loadDrill(sourceCategory);
      return { ok: true, count: res.count };
    },
    [categories, refresh, loadDrill],
  );

  const createCat = useCallback(
    async (name: string, kind: "essential" | "discretionary"): Promise<CreateResult> => {
      const res = await createCategory(name, kind);
      if (res.ok) setCategories((cs) => [...cs, res.category].sort((a, b) => a.name.localeCompare(b.name)));
      return res;
    },
    [],
  );

  // Open handlers — fire the view event once per category per load (idempotent, so
  // the Popover's toggle-click closing again never re-fires); lazy-load the drill
  // on first open (cached after).
  function onYearOpen(category: string) {
    if (!spreadViewed.current.has(category)) {
      spreadViewed.current.add(category);
      recordSpreadViewed();
    }
  }
  function onDrillOpen(category: string) {
    const cached = drillCache[category];
    if (!cached || cached.status === "error") void loadDrill(category);
    if (!drillViewed.current.has(category)) {
      drillViewed.current.add(category);
      recordDrilldownViewed();
    }
  }

  function statusBadge(row: BudgetRow) {
    if (row.status === "none" || row.effectiveCap == null) return null;
    const remaining = round2(row.effectiveCap - row.actualThisMonth);
    if (row.status === "over") {
      return (
        <span className="text-xs font-medium text-amber-700">
          ▲ {fill(C.over, { amount: money(Math.abs(remaining)) })}
        </span>
      );
    }
    return <span className="text-xs font-medium text-gray-600">● {fill(C.left, { amount: money(remaining) })}</span>;
  }

  // Empty: no transactions at all → an honest connect nudge (never fake rows).
  if (!view.hasData && rows.length === 0) {
    return (
      <div className="mt-8 rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-gray-900">{C.emptyTitle}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{C.emptyBody}</p>
        <Link
          href="/accounts"
          className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {C.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* WLT-22-5 — a one-time, dismissible heads-up that transfers were set aside. */}
      {view.setAsideCount > 0 && !nudgeDismissed ? (
        <div
          role="region"
          aria-label={TR_A.nudgeRegion}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm"
        >
          <span className="text-gray-700">
            {view.setAsideCount === 1 ? TR.nudgeOne : fill(TR.nudgeMany, { count: String(view.setAsideCount) })}
          </span>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={() => excludedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="font-medium text-gray-900 underline"
            >
              {TR.nudgeReview}
            </button>
            <button type="button" onClick={dismissNudge} className="text-gray-500 underline">
              {TR.nudgeDismiss}
            </button>
          </div>
        </div>
      ) : null}
      <table className="w-full border-collapse text-sm" aria-label={COPY.budgetA11y.table}>
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="py-2 pr-4 font-medium">{C.colCategory}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{C.colRecommended}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{C.colActual}</th>
            <th scope="col" className="py-2 font-medium">{C.colBudget}</th>
          </tr>
        </thead>
        <tbody>
          {spendRows.map((row) => {
            const series = view.series[row.category];
            const hasSeries = Array.isArray(series) && series.some((v) => v > 0);
            return (
            <tr key={row.category} className="block border-b border-gray-200 py-3 md:table-row md:py-0">
              <td className="block py-0.5 text-base font-medium text-gray-900 md:table-cell md:py-3 md:pr-4 md:text-sm md:font-normal">
                {row.label}
                {hasSeries ? (
                  // WLT-21-2 — the 12-month spread, in a popover (not an inline
                  // table-row expansion); Headless UI handles focus/Esc/outside-click.
                  <Popover className="relative ml-2 inline-block">
                    <PopoverButton
                      onClick={() => onYearOpen(row.category)}
                      className="align-middle text-xs font-normal text-gray-500 underline"
                    >
                      {({ open }) => (
                        <>
                          {open ? C_Y.hideYear : C_Y.viewYear}
                          <span className="sr-only"> {fill(open ? A_Y.toggleCollapse : A_Y.toggle, { category: row.label })}</span>
                        </>
                      )}
                    </PopoverButton>
                    <PopoverPanel
                      anchor="bottom start"
                      aria-label={fill(A_Y.seriesCaption, { category: row.label })}
                      className="z-50 w-[min(36rem,92vw)] rounded-md border border-gray-200 bg-white p-3 shadow-lg"
                    >
                      <YearSpread label={row.label} points={series} months={view.seriesMonths} cap={row.effectiveCap} />
                    </PopoverPanel>
                  </Popover>
                ) : null}
              </td>
              <td className="block py-0.5 text-gray-600 md:table-cell md:py-3 md:pr-4">
                <span className="mr-2 text-xs text-gray-500 md:hidden">{C.colRecommended}</span>
                {row.recommended != null ? (
                  <span className="inline-flex items-center gap-2">
                    {money(row.recommended)}
                    {editing !== row.category ? (
                      <button
                        type="button"
                        onClick={() => useRecommended(row)}
                        className="text-xs font-medium text-gray-500 underline"
                      >
                        {C.useThis}
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <span title={C.coldStartNote}>{C.coldStartDash}</span>
                )}
              </td>
              <td className="block py-0.5 text-gray-900 md:table-cell md:py-3 md:pr-4">
                <span className="mr-2 text-xs text-gray-500 md:hidden">{C.colActual}</span>
                {row.actualThisMonth > 0 ? (
                  // WLT-22-1 — the line items behind the number, in a popover (not an
                  // inline table-row expansion). The recategorize picker lives inside;
                  // Headless UI Popover is portal-aware so the nested Menu won't close it.
                  <Popover className="relative inline-block">
                    <PopoverButton
                      onClick={() => onDrillOpen(row.category)}
                      aria-label={fill(A_D.openItems, { category: row.label, amount: money(row.actualThisMonth) })}
                      className="underline decoration-dotted decoration-gray-400 underline-offset-2"
                    >
                      {money(row.actualThisMonth)}
                    </PopoverButton>
                    <PopoverPanel
                      anchor="bottom end"
                      aria-label={fill(A_D.list, { category: row.label })}
                      className="z-50 max-h-[60vh] w-[min(28rem,92vw)] overflow-auto rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg"
                    >
                      <CategoryTransactions
                        label={row.label}
                        state={drillCache[row.category] ?? { status: "loading" }}
                        onRetry={() => loadDrill(row.category)}
                        categories={categories}
                        onRecategorize={(dedupKey, categoryId, applyToMerchant) =>
                          recategorize(row.category, dedupKey, categoryId, applyToMerchant)
                        }
                        onCreateCategory={createCat}
                      />
                    </PopoverPanel>
                  </Popover>
                ) : (
                  money(row.actualThisMonth)
                )}
              </td>
              <td className="block py-1 md:table-cell md:py-3 md:align-top">
                <span className="mr-2 text-xs text-gray-500 md:hidden">{C.colBudget}</span>
                {editing === row.category ? (
                  <div className="mt-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        role="group"
                        aria-label={COPY.budgetA11y.budgetTypeToggle}
                        className="inline-flex overflow-hidden rounded-md border border-gray-300"
                      >
                        {(["amount", "percent"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={draftType === t}
                            onClick={() => setDraftType(t)}
                            className={`px-3 py-1 text-sm ${draftType === t ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
                          >
                            {t === "amount" ? C.toggleAmount : C.togglePercent}
                          </button>
                        ))}
                      </div>
                      <div className="w-28">
                        <TextField
                          label={draftType === "amount" ? C.amountLabel : C.percentLabel}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder={C.amountPlaceholder}
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          aria-label={fill(COPY.budgetA11y.budgetInput, { category: row.label })}
                        />
                      </div>
                    </div>
                    {draftType === "percent" ? (
                      <p className="text-xs text-gray-500">
                        {view.typicalMonthlyTotal != null && Number(draftValue) > 0
                          ? fill(C.percentHelper, {
                              percent: String(Number(draftValue)),
                              amount: money(round2((Number(draftValue) / 100) * view.typicalMonthlyTotal)),
                            })
                          : C.percentNeedsHistory}
                      </p>
                    ) : null}
                    {rowError ? <Banner variant="error">{rowError}</Banner> : null}
                    <div className="flex items-center gap-3">
                      <Button onClick={() => save(row.category)} loading={busy} loadingLabel={C.savingCta}>
                        {C.saveCta}
                      </Button>
                      <button type="button" onClick={cancelEdit} className="text-sm text-gray-500 underline">
                        {C.pickerCancel}
                      </button>
                      {row.budget ? (
                        <button
                          type="button"
                          onClick={() => clear(row.category)}
                          className="text-sm text-gray-500 underline"
                        >
                          {C.clearCta}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : row.budget ? (
                  <div className="mt-1 space-y-1 md:mt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {row.budget.type === "amount" ? money(row.budget.amount) : `${row.budget.percent}%`}
                      </span>
                      {statusBadge(row)}
                    </div>
                    <div className="flex gap-3 text-xs">
                      <button type="button" onClick={() => startEdit(row)} className="text-gray-700 underline">
                        {C.editCta}
                      </button>
                      <button type="button" onClick={() => clear(row.category)} className="text-gray-500 underline">
                        {C.clearCta}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="text-sm font-medium text-gray-900 underline"
                  >
                    {C.setCta}
                  </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      {/* WLT-22-5 — the visible "Transfers & Payments" group: shown + drillable so
          the user sees what was set aside, but plainly marked NOT counted as spend. */}
      {excludedRows.length > 0 ? (
        <div ref={excludedRef} className="mt-8 border-t-2 border-gray-200 pt-4" aria-label={TR_A.groupHeading} role="group">
          <h2 className="text-sm font-semibold text-gray-900">{TR.groupLabel}</h2>
          <p className="mt-0.5 max-w-prose text-xs text-gray-500">
            <span className="font-medium text-gray-600">{TR.groupCaption}.</span> {TR.groupHelp}
          </p>
          <ul className="mt-2 divide-y divide-gray-100">
            {excludedRows.map((row) => (
              <li key={row.category} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-700">{row.label}</span>
                {row.actualThisMonth > 0 ? (
                  <Popover className="relative inline-block">
                    <PopoverButton
                      onClick={() => onDrillOpen(row.category)}
                      aria-label={fill(TR_A.groupTotal, { amount: money(row.actualThisMonth) })}
                      className="text-gray-600 underline decoration-dotted decoration-gray-400 underline-offset-2"
                    >
                      {money(row.actualThisMonth)}
                    </PopoverButton>
                    <PopoverPanel
                      anchor="bottom end"
                      aria-label={fill(A_D.list, { category: row.label })}
                      className="z-50 max-h-[60vh] w-[min(28rem,92vw)] overflow-auto rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg"
                    >
                      <CategoryTransactions
                        label={row.label}
                        state={drillCache[row.category] ?? { status: "loading" }}
                        onRetry={() => loadDrill(row.category)}
                        categories={categories}
                        onRecategorize={(dedupKey, categoryId, applyToMerchant) =>
                          recategorize(row.category, dedupKey, categoryId, applyToMerchant)
                        }
                        onCreateCategory={createCat}
                      />
                    </PopoverPanel>
                  </Popover>
                ) : (
                  <span className="text-gray-500">{money(row.actualThisMonth)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Add a category (the picker) — pre-set a budget on a category you haven't spent in yet. */}
      <div className="mt-4">
        {!pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={pickerOptions.length === 0}
            className="text-sm font-medium text-gray-700 underline disabled:opacity-50"
            aria-label={COPY.budgetA11y.addCategory}
          >
            {C.addCta}
          </button>
        ) : (
          <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
            <div>
              <p className="text-sm font-medium text-gray-900">{C.pickerTitle}</p>
              <p className="mt-0.5 text-xs text-gray-500">{C.pickerHint}</p>
            </div>
            {pickerOptions.length === 0 ? (
              <p className="text-sm text-gray-500">{C.pickerEmpty}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pickerOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => addCategory(c)}
                    className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {humanizeCategory(c)}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="block text-sm text-gray-500 underline"
            >
              {C.pickerCancel}
            </button>
          </div>
        )}
      </div>

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

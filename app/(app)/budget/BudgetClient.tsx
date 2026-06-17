"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BUDGETABLE_CATEGORIES, type BudgetRow, humanizeCategory } from "@wealth/core";
import { Banner, Button, TextField, Toast } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";
import { type BudgetViewDTO, clearBudget, fetchBudget, recordSpreadViewed, saveBudget } from "@/app/lib/budget-client";
import { YearSpread } from "./YearSpread";

const C = COPY.budget;

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

export function BudgetClient({ initial }: { initial: BudgetViewDTO }) {
  const [view, setView] = useState<BudgetViewDTO>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<"amount" | "percent">("amount");
  const [draftValue, setDraftValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]); // ephemeral picker-added (until saved)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set()); // expanded year-spreads (WLT-21-2)
  const spreadViewed = useRef<Set<string>>(new Set()); // fire budget_spread_viewed once per category per load

  // Reconcile with live server state on mount (#36 — force-dynamic page can hand a
  // stale prefetch; trusting initial props forever is the bug).
  const refresh = useCallback(async () => {
    const res = await fetchBudget();
    if (res.ok) setView(res.view);
  }, []);
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
      }));
    return [...view.rows, ...extra];
  }, [view.rows, added]);

  const pickerOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.category));
    return BUDGETABLE_CATEGORIES.filter((c) => !present.has(c));
  }, [rows]);

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

  // WLT-21-2 — expand/collapse a category's 12-month spread; record the view once.
  function toggleYear(category: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
        if (!spreadViewed.current.has(category)) {
          spreadViewed.current.add(category);
          recordSpreadViewed();
        }
      }
      return next;
    });
  }

  const C_Y = COPY.budgetYear;
  const A_Y = COPY.budgetYearA11y;

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
          {rows.map((row) => {
            const series = view.series[row.category];
            const hasSeries = Array.isArray(series) && series.some((v) => v > 0);
            const yearOpen = openYears.has(row.category);
            const panelId = `year-${row.category}`;
            return (
            <Fragment key={row.category}>
            <tr className="block border-b border-gray-200 py-3 md:table-row md:py-0">
              <td className="block py-0.5 text-base font-medium text-gray-900 md:table-cell md:py-3 md:pr-4 md:text-sm md:font-normal">
                {row.label}
                {hasSeries ? (
                  <button
                    type="button"
                    onClick={() => toggleYear(row.category)}
                    aria-expanded={yearOpen}
                    aria-controls={panelId}
                    aria-label={fill(yearOpen ? A_Y.toggleCollapse : A_Y.toggle, { category: row.label })}
                    className="ml-2 align-middle text-xs font-normal text-gray-500 underline"
                  >
                    {yearOpen ? C_Y.hideYear : C_Y.viewYear}
                  </button>
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
                {money(row.actualThisMonth)}
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
            {hasSeries && yearOpen ? (
              <tr className="block md:table-row">
                <td id={panelId} colSpan={4} className="block pb-3 md:table-cell">
                  <YearSpread
                    label={row.label}
                    points={series}
                    months={view.seriesMonths}
                    cap={row.effectiveCap}
                  />
                </td>
              </tr>
            ) : null}
            </Fragment>
            );
          })}
        </tbody>
      </table>

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
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium text-gray-900">{C.pickerTitle}</p>
            <p className="mt-0.5 text-xs text-gray-500">{C.pickerHint}</p>
            {pickerOptions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{C.pickerEmpty}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
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
              className="mt-2 block text-xs text-gray-500 underline"
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

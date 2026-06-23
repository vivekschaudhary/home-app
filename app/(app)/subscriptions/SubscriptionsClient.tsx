"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SubscriptionCadence, SubscriptionRow } from "@wealth/core";
import { Toast } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";
import { type SubscriptionsViewDTO, fetchSubscriptions, unmarkSubscription } from "@/app/lib/subscriptions-client";

const S = COPY.subscriptions;
const SA = COPY.subscriptionsA11y;
const NUDGE_KEY = "wlt24-2-detected-nudge-dismissed"; // scoped per-user at runtime

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const CADENCE_LABEL: Record<SubscriptionCadence, string> = {
  monthly: S.cadenceMonthly,
  weekly: S.cadenceWeekly,
  annual: S.cadenceAnnual,
  irregular: S.cadenceIrregular,
  pending: S.cadencePending,
};

export function SubscriptionsClient({ initial, userId }: { initial: SubscriptionsViewDTO; userId: string }) {
  const [view, setView] = useState<SubscriptionsViewDTO>(initial);
  const [busy, setBusy] = useState<string | null>(null); // normKey being unmarked
  const [toast, setToast] = useState<string | null>(null);

  // Reconcile with live server state on mount (#36).
  const refresh = useCallback(async () => {
    const res = await fetchSubscriptions();
    if (res.ok) setView(res.view);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // WLT-24-2 — the review nudge: how many auto-detected subscriptions await review.
  const detectedCount = useMemo(() => view.subscriptions.filter((r) => r.source === "auto").length, [view.subscriptions]);
  // Per-USER key so one user's dismissal never hides another's nudge on a shared
  // browser. Start HIDDEN and reveal only after reading storage on the client —
  // rendering on first paint would flash for a user who already dismissed it.
  const nudgeKey = `${NUDGE_KEY}:${userId}`;
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

  async function unmark(row: SubscriptionRow) {
    setBusy(row.normKey);
    // WLT-24-3 — dismiss exactly this row's price SERIES (its cluster's dedupKeys) in
    // one call; a sibling series from the same vendor is untouched.
    const res = await unmarkSubscription(row.dedupKeys);
    setBusy(null);
    if (!res.ok) {
      setToast(S.error);
      return;
    }
    setToast(S.unmarkedToast);
    await refresh();
  }

  // Empty: nothing marked → an honest nudge to the ledger (never fake rows).
  if (view.subscriptions.length === 0) {
    return (
      <div className="mt-8 rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-gray-900">{S.emptyTitle}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{S.emptyBody}</p>
        <Link href="/transactions" className="mt-5 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          {S.emptyCta}
        </Link>
        {toast ? <Toast message={toast} /> : null}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* WLT-24-2 — the review nudge: a single quiet line drawing the eye to the
          auto-detected rows below. Dismissible + sticky per-user; never a modal. */}
      {detectedCount > 0 && !nudgeDismissed ? (
        <div
          role="status"
          aria-label={SA.nudgeRegion}
          className="mb-4 flex items-start justify-between gap-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <div className="text-sm text-gray-700">
            <p className="font-medium text-gray-900">
              {detectedCount === 1 ? S.nudgeOne : fill(S.nudgeMany, { count: String(detectedCount) })}
            </p>
            <p className="mt-0.5 text-gray-600">{S.nudgeBody}</p>
          </div>
          <button
            type="button"
            onClick={dismissNudge}
            aria-label={SA.nudgeDismissA11y}
            className="shrink-0 text-xs font-medium text-gray-500 underline"
          >
            {S.nudgeDismiss}
          </button>
        </div>
      ) : null}

      {/* Headline — the at-a-glance weight (both per-month and per-year). */}
      <p
        className="text-lg font-semibold text-gray-900"
        aria-label={fill(SA.headline, {
          monthly: money(view.monthlyTotal),
          annual: money(view.annualTotal),
          count: String(view.subscriptions.length),
        })}
      >
        {fill(S.headline, { monthly: money(view.monthlyTotal), annual: money(view.annualTotal) })}
      </p>

      <table className="mt-4 w-full border-collapse text-sm" aria-label={SA.listA11y}>
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="py-2 pr-4 font-medium">{S.colMerchant}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{S.colAmount}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{S.colCadence}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{S.colMonthly}</th>
            <th scope="col" className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {view.subscriptions.map((row) => {
            const counted = row.monthlyEquivalent != null;
            // WLT-24-3 — a distinct accessible name per row (amount + cadence) so two
            // same-named vendor rows (e.g. two "Sony PlayStation" series) are
            // distinguishable to assistive tech; the amount is the disambiguator.
            const rowLabel =
              row.source === "auto"
                ? fill(SA.rowDetectedA11y, { merchant: row.merchant, amount: money(row.typicalAmount), cadence: CADENCE_LABEL[row.cadence] })
                : fill(SA.rowA11y, {
                    merchant: row.merchant,
                    amount: money(row.typicalAmount),
                    cadence: CADENCE_LABEL[row.cadence],
                    monthly: counted ? money(row.monthlyEquivalent as number) : "—",
                  });
            return (
              <tr key={row.normKey} aria-label={rowLabel} className="block border-b border-gray-200 py-3 md:table-row md:py-0">
                <td className="block py-0.5 text-base font-medium text-gray-900 md:table-cell md:py-3 md:pr-4 md:text-sm md:font-normal">
                  {row.merchant}
                  {row.source === "auto" ? (
                    <span
                      className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-gray-500"
                      aria-label={SA.detectedTagA11y}
                    >
                      {S.detectedTag}
                    </span>
                  ) : null}
                </td>
                <td className="block py-0.5 text-gray-700 md:table-cell md:py-3 md:pr-4">
                  <span className="mr-2 text-xs text-gray-500 md:hidden">{S.colAmount}</span>
                  {money(row.typicalAmount)}
                </td>
                <td className="block py-0.5 text-gray-600 md:table-cell md:py-3 md:pr-4">
                  <span className="mr-2 text-xs text-gray-500 md:hidden">{S.colCadence}</span>
                  {CADENCE_LABEL[row.cadence]}
                  {!counted ? <span className="ml-2 block text-xs text-gray-400 md:inline">{S.pendingNote}</span> : null}
                </td>
                <td className="block py-0.5 text-gray-900 md:table-cell md:py-3 md:pr-4">
                  <span className="mr-2 text-xs text-gray-500 md:hidden">{S.colMonthly}</span>
                  {counted ? money(row.monthlyEquivalent as number) : <span className="text-gray-400">—</span>}
                </td>
                <td className="block py-1 md:table-cell md:py-3 md:text-right">
                  <button
                    type="button"
                    onClick={() => unmark(row)}
                    disabled={busy === row.normKey}
                    aria-label={fill(SA.unmarkA11y, { merchant: row.merchant })}
                    className="text-xs font-medium text-gray-500 underline disabled:opacity-50"
                  >
                    {busy === row.normKey ? S.saving : S.unmarkAction}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

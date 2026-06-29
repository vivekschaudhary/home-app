"use client";

// WLT-27-5 — RegionSwitcher: per-currency spending context selector.
// Renders a dropdown of the user's distinct account currencies; hidden when
// the user has only one currency (single-currency users see no change).
// Uses router.push to set ?currency=<code> — the RSC re-renders with the
// new activeCurrency, passing it to all spending reads. No full page reload.
//
// The currency list and activeCurrency come from the page RSC (which reads
// financial_accounts), so this component needs no additional data fetching.
// The active currency is indicated by the <select> value (programmatic) and
// visually by the native selected state. Screen readers announce the change
// via the native <select> semantics.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { COPY } from "@/app/lib/copy";

const C = COPY.regionSwitcher;

// Human-readable labels for the supported ISO 4217 codes. Matches
// ManualAccountForm.CURRENCY_OPTIONS — add new entries there AND here.
const CURRENCY_LABELS: Record<string, string> = {
  USD: "US Dollar (USD)",
  EUR: "Euro (EUR)",
  GBP: "British Pound (GBP)",
  JPY: "Japanese Yen (JPY)",
  CAD: "Canadian Dollar (CAD)",
  AUD: "Australian Dollar (AUD)",
  CHF: "Swiss Franc (CHF)",
  CNY: "Chinese Yuan (CNY)",
  INR: "Indian Rupee (INR)",
  MXN: "Mexican Peso (MXN)",
};

function RegionSwitcherInner({
  currencies,
  activeCurrency,
}: {
  currencies: string[];
  activeCurrency: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Single-currency users see no switcher — AC-1, AC-9.
  if (currencies.length <= 1) return null;

  function handleChange(code: string) {
    // Preserve other existing search params (e.g. ?category= or ?month=) when
    // switching currency so a user drilling into a category can switch context
    // without losing their place in the filter flow.
    const params = new URLSearchParams(searchParams.toString());
    params.set("currency", code);
    router.push(`?${params.toString()}`);
  }

  const srLabel = C.srActiveLabel.replace("{currency}", activeCurrency);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="region-currency" className="sr-only">
        {C.ariaLabel}
      </label>
      {/* sr-only span: announces the active currency to screen readers
          even when the dropdown is collapsed (AC-10). */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {srLabel}
      </span>
      <select
        id="region-currency"
        value={activeCurrency}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-label={C.ariaLabel}
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {CURRENCY_LABELS[code] ?? code}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * WLT-27-5 — Currency context switcher, visible only for multi-currency users.
 * Renders only when MULTI_CURRENCY_ACCOUNTS_ENABLED is on (the page RSC passes
 * an empty currencies array otherwise so the component self-hides). AC-3.
 *
 * Props:
 * - `currencies`: distinct currency codes from the user's `financial_accounts`
 *   (populated by the RSC via readDistinctCurrencies; empty = flag off or no accounts).
 * - `activeCurrency`: the current currency context, validated from ?currency= in
 *   the page's searchParams (RSC-resolved, defaults to 'USD').
 */
export function RegionSwitcher({
  currencies,
  activeCurrency,
}: {
  currencies: string[];
  activeCurrency: string;
}) {
  // Wrap with Suspense: useSearchParams() inside RegionSwitcherInner requires a
  // Suspense boundary to enable static RSC rendering. The page is force-dynamic
  // so the Suspense boundary is thin (null fallback is fine — no visible flash).
  return (
    <Suspense fallback={null}>
      <RegionSwitcherInner currencies={currencies} activeCurrency={activeCurrency} />
    </Suspense>
  );
}

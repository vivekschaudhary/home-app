"use client";

// WLT-27-5 — RegionSwitcher: persists active currency as a URL search param
// ?currency=<ISO-4217-code>. Rendered only for users with >1 distinct currency
// AND when MULTI_CURRENCY_ACCOUNTS_ENABLED is true (checked in parent RSC).
// Hidden for users with only one currency (or if the list is empty).

import { useRouter, useSearchParams } from "next/navigation";
import { COPY } from "@/app/lib/copy";

const C = COPY.regionSwitcher;

// Full currency name lookup for the option labels. Uses Intl.DisplayNames where
// available, falling back to a short built-in map for common codes.
const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Yuan",
  INR: "Indian Rupee",
  MXN: "Mexican Peso",
  BRL: "Brazilian Real",
  KRW: "South Korean Won",
  SGD: "Singapore Dollar",
  HKD: "Hong Kong Dollar",
  NOK: "Norwegian Krone",
  SEK: "Swedish Krona",
  DKK: "Danish Krone",
  NZD: "New Zealand Dollar",
  ZAR: "South African Rand",
  AED: "UAE Dirham",
};

function currencyLabel(code: string): string {
  const name = CURRENCY_NAMES[code] ?? code;
  return `${name} (${code})`;
}

export function RegionSwitcher({
  currencies,
  currentCurrency,
}: {
  currencies: string[]; // distinct currencies from the user's financial_accounts
  currentCurrency: string; // parsed from searchParams or default 'USD'
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (currencies.length <= 1) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    const next = new URLSearchParams(searchParams.toString());
    if (code === "USD") {
      next.delete("currency"); // default: no param needed
    } else {
      next.set("currency", code);
    }
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="region-switcher" className="text-sm font-medium text-gray-700">
        {C.label}
      </label>
      <select
        id="region-switcher"
        value={currentCurrency}
        onChange={handleChange}
        aria-label={C.ariaLabel}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {currencyLabel(code)}
          </option>
        ))}
      </select>
    </div>
  );
}

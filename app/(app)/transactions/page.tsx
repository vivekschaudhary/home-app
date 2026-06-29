import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { parseMonth, readTransactionsPage } from "@/app/lib/transactions";
import { COPY } from "@/app/lib/copy";
import { RegionSwitcher } from "@/app/(app)/accounts/RegionSwitcher";
import { TransactionsClient } from "./TransactionsClient";

// WLT-23-1 — the all-accounts Transactions ledger, mounted live into the shell
// (nav.ts flips the section to 'live'). The (app) layout already enforces AAL2;
// requireAal2() here is the per-page belt-and-suspenders + supplies the userId.
// Read page 1 server-side on every load (force-dynamic → reconcile-on-load, the
// real session→RLS→render seam, #36); search + Load-more go through the route.
// WLT-26-1: reads ?category= and ?month= for chart bar click deep-links.
// WLT-27-5: reads ?currency= for the RegionSwitcher context (AC-2, AC-7).
export const dynamic = "force-dynamic";

// ISO 4217 three-letter uppercase code: validate and default to 'USD' on mismatch.
// AC-12: unrecognized currency codes are silently ignored (no crash, no error banner).
function parseCurrency(raw: string | undefined): string {
  if (raw && /^[A-Z]{3}$/.test(raw)) return raw;
  return "USD";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; month?: string; currency?: string }>;
}) {
  const userId = await requireAal2();
  const sp = await searchParams;
  // category: present (even "") = filter; absent = all. month: 'YYYY-MM' only.
  const category = sp.category !== undefined ? sp.category : null;
  const month = parseMonth(sp.month);

  // WLT-27-5: MULTI_CURRENCY_ACCOUNTS_ENABLED gates the switcher and currency-scoped
  // ledger reads. When off, activeCurrency is always 'USD' and the transactions read
  // has no currency filter (no behavior change for existing users). AC-3.
  const multiCurrencyEnabled = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";
  const activeCurrency = multiCurrencyEnabled ? parseCurrency(sp.currency) : "USD";

  const [result, currencies] = await Promise.all([
    readTransactionsPage(userId, {
      category,
      month,
      currency: multiCurrencyEnabled ? activeCurrency : null,
    }),
    multiCurrencyEnabled ? readDistinctCurrencies(userId) : Promise.resolve([]),
  ]);
  await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_VIEWED, userId, {});

  const C = COPY.transactions;
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{C.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{C.subtitle}</p>
        </div>
        {/* WLT-27-5: switcher hides itself when currencies.length <= 1 (AC-1, AC-3) */}
        {multiCurrencyEnabled && (
          <RegionSwitcher currencies={currencies} activeCurrency={activeCurrency} />
        )}
      </div>
      <TransactionsClient
        initial={result.ok ? result.page : null}
        initialError={!result.ok}
        initialCategory={category}
        initialMonth={month}
        initialCurrency={multiCurrencyEnabled ? activeCurrency : null}
      />
    </div>
  );
}

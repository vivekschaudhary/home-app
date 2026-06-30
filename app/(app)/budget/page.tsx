import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { getBudgetView } from "@/app/lib/budget";
import { COPY } from "@/app/lib/copy";
import { RegionSwitcher } from "@/app/(app)/accounts/RegionSwitcher";
import { BudgetClient } from "./BudgetClient";

// WLT-21-1 — Budget & Spending, mounted live into the shell (nav.ts flips the
// section to 'live'). The (app) layout already enforces AAL2; requireAal2() here
// is the per-page belt-and-suspenders + supplies the userId. Reconcile-on-load
// (force-dynamic) — never stale props (#36).
// WLT-27-5: reads ?currency= and passes activeCurrency to budget data reads +
// the RegionSwitcher component.
export const dynamic = "force-dynamic";

// ISO 4217 three-letter uppercase code: validate and default to 'USD' on mismatch.
// AC-12: unrecognized currency codes are silently ignored (no crash, no error banner).
function parseCurrency(raw: string | undefined): string {
  if (raw && /^[A-Z]{3}$/.test(raw)) return raw;
  return "USD";
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const userId = await requireAal2();
  const sp = await searchParams;

  // WLT-27-5: MULTI_CURRENCY_ACCOUNTS_ENABLED gates the switcher and multi-currency
  // reads. When off, activeCurrency is always 'USD' (no behavior change for existing
  // users). Read flag in RSC — client components cannot access process.env.
  const multiCurrencyEnabled = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";
  const activeCurrency = multiCurrencyEnabled ? parseCurrency(sp.currency) : "USD";

  const [view, currencies] = await Promise.all([
    getBudgetView(userId, activeCurrency),
    multiCurrencyEnabled ? readDistinctCurrencies(userId) : Promise.resolve([]),
  ]);
  await emitFunnel(FUNNEL_EVENTS.BUDGET_VIEWED, userId, {});

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{COPY.budget.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{COPY.budget.subtitle}</p>
        </div>
        {/* WLT-27-5: switcher hides itself when currencies.length <= 1 (AC-1, AC-3) */}
        {multiCurrencyEnabled && (
          <RegionSwitcher currencies={currencies} activeCurrency={activeCurrency} />
        )}
      </div>
      <BudgetClient initial={view} userId={userId} currency={activeCurrency} />
    </div>
  );
}

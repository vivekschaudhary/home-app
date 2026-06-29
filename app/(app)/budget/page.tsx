import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { getBudgetView } from "@/app/lib/budget";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { COPY } from "@/app/lib/copy";
import { BudgetClient } from "./BudgetClient";
import { RegionSwitcher } from "../accounts/RegionSwitcher";

// WLT-21-1 — Budget & Spending, mounted live into the shell (nav.ts flips the
// section to 'live'). The (app) layout already enforces AAL2; requireAal2() here
// is the per-page belt-and-suspenders + supplies the userId. Reconcile-on-load
// (force-dynamic) — never stale props (#36).
// WLT-27-5: reads ?currency= to scope spending to a single currency.
export const dynamic = "force-dynamic";

const ISO_4217_RE = /^[A-Z]{3}$/;

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const userId = await requireAal2();
  const sp = await searchParams;
  const MULTI_CURRENCY_ENABLED = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";

  let activeCurrency = "USD";
  if (MULTI_CURRENCY_ENABLED && sp.currency && ISO_4217_RE.test(sp.currency)) {
    activeCurrency = sp.currency;
  }

  const [view, currencies] = await Promise.all([
    getBudgetView(userId, activeCurrency),
    MULTI_CURRENCY_ENABLED ? readDistinctCurrencies(userId) : Promise.resolve(["USD"]),
  ]);
  await emitFunnel(FUNNEL_EVENTS.BUDGET_VIEWED, userId, {});

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{COPY.budget.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{COPY.budget.subtitle}</p>
        </div>
        {MULTI_CURRENCY_ENABLED ? <RegionSwitcher currencies={currencies} currentCurrency={activeCurrency} /> : null}
      </div>
      <BudgetClient initial={view} userId={userId} />
    </div>
  );
}

import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { parseMonth, readTransactionsPage } from "@/app/lib/transactions";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { COPY } from "@/app/lib/copy";
import { TransactionsClient } from "./TransactionsClient";
import { RegionSwitcher } from "../accounts/RegionSwitcher";

// WLT-23-1 — the all-accounts Transactions ledger, mounted live into the shell
// (nav.ts flips the section to 'live'). The (app) layout already enforces AAL2;
// requireAal2() here is the per-page belt-and-suspenders + supplies the userId.
// Read page 1 server-side on every load (force-dynamic → reconcile-on-load, the
// real session→RLS→render seam, #36); search + Load-more go through the route.
// WLT-26-1: reads ?category= and ?month= for chart bar click deep-links.
// WLT-27-5: reads ?currency= for region switching.
export const dynamic = "force-dynamic";

const ISO_4217_RE = /^[A-Z]{3}$/;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; month?: string; currency?: string }>;
}) {
  const userId = await requireAal2();
  const sp = await searchParams;
  const MULTI_CURRENCY_ENABLED = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";
  // category: present (even "") = filter; absent = all. month: 'YYYY-MM' only.
  const category = sp.category !== undefined ? sp.category : null;
  const month = parseMonth(sp.month);

  let activeCurrency: string | null = null;
  if (MULTI_CURRENCY_ENABLED && sp.currency && ISO_4217_RE.test(sp.currency)) {
    activeCurrency = sp.currency;
  }

  const [result, currencies] = await Promise.all([
    readTransactionsPage(userId, { category, month, currency: activeCurrency }),
    MULTI_CURRENCY_ENABLED ? readDistinctCurrencies(userId) : Promise.resolve(["USD"]),
  ]);
  await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_VIEWED, userId, {});

  const C = COPY.transactions;
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{C.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{C.subtitle}</p>
        </div>
        {MULTI_CURRENCY_ENABLED ? (
          <RegionSwitcher currencies={currencies} currentCurrency={activeCurrency ?? "USD"} />
        ) : null}
      </div>
      <TransactionsClient
        initial={result.ok ? result.page : null}
        initialError={!result.ok}
        initialCategory={category}
        initialMonth={month}
      />
    </div>
  );
}

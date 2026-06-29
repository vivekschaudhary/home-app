import { requireAal2 } from "@vc1023/passkey-2fa";
import { handlers } from "@/app/lib/aggregation";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { AccountsClient } from "./AccountsClient";

export const dynamic = "force-dynamic";

const ISO_4217_RE = /^[A-Z]{3}$/;

// Accounts — connect a bank + see connected accounts. AAL2-gated server-side
// (requireAal2 redirects to /sign-in unless the session is fully verified).
// WLT-27-2: MANUAL_ACCOUNTS_ENABLED and MULTI_CURRENCY_ACCOUNTS_ENABLED flags
// are read here (RSC) and passed as props so client components don't touch env.
// WLT-27-5: reads ?currency= to scope the RegionSwitcher initial value.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const userId = await requireAal2();
  const sp = await searchParams;
  const manualAccountsEnabled = process.env.MANUAL_ACCOUNTS_ENABLED === "true";
  const multiCurrencyEnabled = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";

  const [connections, currencies] = await Promise.all([
    handlers.connectionsList({ userId }),
    multiCurrencyEnabled ? readDistinctCurrencies(userId) : Promise.resolve(["USD"]),
  ]);

  let activeCurrency = "USD";
  if (multiCurrencyEnabled && sp.currency && ISO_4217_RE.test(sp.currency)) {
    activeCurrency = sp.currency;
  }

  return (
    <AccountsClient
      initialConnections={connections}
      manualAccountsEnabled={manualAccountsEnabled}
      multiCurrencyEnabled={multiCurrencyEnabled}
      currencies={currencies}
      initialCurrency={activeCurrency}
    />
  );
}

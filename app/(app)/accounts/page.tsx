import { requireAal2 } from "@vc1023/passkey-2fa";
import { handlers } from "@/app/lib/aggregation";
import { AccountsClient } from "./AccountsClient";

export const dynamic = "force-dynamic";

// Accounts — connect a bank + see connected accounts. AAL2-gated server-side
// (requireAal2 redirects to /sign-in unless the session is fully verified).
// WLT-27-2: MANUAL_ACCOUNTS_ENABLED and MULTI_CURRENCY_ACCOUNTS_ENABLED flags
// are read here (RSC) and passed as props so client components don't touch env.
export default async function AccountsPage() {
  const userId = await requireAal2();
  const connections = await handlers.connectionsList({ userId });

  const manualAccountsEnabled = process.env.MANUAL_ACCOUNTS_ENABLED === "true";
  const multiCurrencyEnabled = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";

  return (
    <AccountsClient
      initialConnections={connections}
      manualAccountsEnabled={manualAccountsEnabled}
      multiCurrencyEnabled={multiCurrencyEnabled}
    />
  );
}

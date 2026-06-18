import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readTransactionsPage } from "@/app/lib/transactions";
import { COPY } from "@/app/lib/copy";
import { TransactionsClient } from "./TransactionsClient";

// WLT-23-1 — the all-accounts Transactions ledger, mounted live into the shell
// (nav.ts flips the section to 'live'). The (app) layout already enforces AAL2;
// requireAal2() here is the per-page belt-and-suspenders + supplies the userId.
// Read page 1 server-side on every load (force-dynamic → reconcile-on-load, the
// real session→RLS→render seam, #36); search + Load-more go through the route.
export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const userId = await requireAal2();
  const result = await readTransactionsPage(userId);
  await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_VIEWED, userId, {});

  const C = COPY.transactions;
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{C.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{C.subtitle}</p>
      <TransactionsClient
        initial={result.ok ? result.page : null}
        initialError={!result.ok}
      />
    </div>
  );
}

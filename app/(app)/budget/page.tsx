import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { getBudgetView } from "@/app/lib/budget";
import { COPY } from "@/app/lib/copy";
import { BudgetClient } from "./BudgetClient";

// WLT-21-1 — Budget & Spending, mounted live into the shell (nav.ts flips the
// section to 'live'). The (app) layout already enforces AAL2; requireAal2() here
// is the per-page belt-and-suspenders + supplies the userId. Reconcile-on-load
// (force-dynamic) — never stale props (#36).
export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const userId = await requireAal2();
  const view = await getBudgetView(userId);
  await emitFunnel(FUNNEL_EVENTS.BUDGET_VIEWED, userId, {});

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{COPY.budget.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{COPY.budget.subtitle}</p>
      <BudgetClient initial={view} />
    </div>
  );
}

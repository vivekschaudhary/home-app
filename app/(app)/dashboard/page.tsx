import { Suspense } from "react";
import { requireAal2 } from "@vc1023/passkey-2fa";
import { COPY } from "@/app/lib/copy";
import { getRecap } from "@/app/lib/recap";
import { readCategorySpendChart } from "@/app/lib/dashboard-spend";
import { readDistinctCurrencies } from "@/app/lib/aggregation-read";
import { getOrCreateWorkflow } from "@/app/lib/workflow";
import { DashboardNudge } from "./DashboardNudge";
import { RecapCard } from "./RecapCard";
import { WorkflowCard } from "./WorkflowCard";
import { CategorySpendChart } from "./CategorySpendChart";
import { AnomalyPanel } from "./AnomalyPanel";
import { RegionSwitcher } from "../accounts/RegionSwitcher";

export const dynamic = "force-dynamic";

// WLT-16 flag: the recap ships dark until the daily snapshot job has a cycle of
// history to anchor movement. Default off; flip RECAP_ENABLED=true to surface it.
const RECAP_ENABLED = process.env.RECAP_ENABLED === "true";

// WLT-26-1 flag: the dashboard intelligence section (category spend chart +
// anomaly panel) ships dark until the operator calibrates the spike multiple.
// Default off; flip DASHBOARD_INTELLIGENCE_ENABLED=true to surface it.
const DASHBOARD_INTELLIGENCE_ENABLED = process.env.DASHBOARD_INTELLIGENCE_ENABLED === "true";

// WLT-12: lazy idempotent assembly — select/advance the user's workflow from
// their declared goal; personalizes once real balances exist (two-phase).
async function WorkflowSection({ userId }: { userId: string }) {
  const workflow = await getOrCreateWorkflow(userId);
  return <WorkflowCard view={workflow} />;
}

// WLT-16: the "since last time" recap — reconcile-on-load (reads live each
// request; force-dynamic above).
async function RecapSection({ userId }: { userId: string }) {
  const recap = await getRecap(userId);
  return <RecapCard view={recap} />;
}

// WLT-26-1 + WLT-26-2: the full dashboard intelligence section — anomaly panel
// (above, higher-urgency) + category spend chart (below, contextual).
// WLT-27-5: activeCurrency scopes the chart to the selected currency.
async function DashboardIntelligenceSection({ userId, activeCurrency }: { userId: string; activeCurrency: string }) {
  const chart = await readCategorySpendChart(userId, activeCurrency);
  const C = COPY.dashboardIntelligence;
  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900">{C.sectionTitle}</h2>
      {/* WLT-26-2: anomaly panel — independent Suspense so it streams in after the
          chart without blocking the outer section skeleton. Renders above the chart
          (higher urgency: "something looks off" before "here's the context"). */}
      <Suspense fallback={<AnomalyPanelSkeleton />}>
        <AnomalyPanel userId={userId} />
      </Suspense>
      <CategorySpendChart data={chart} />
    </section>
  );
}

function AnomalyPanelSkeleton() {
  return (
    <div aria-busy="true" className="mb-4">
      <div aria-hidden="true" className="h-4 w-32 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
      <div aria-hidden="true" className="mt-2 h-10 w-full animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
    </div>
  );
}

function DashboardIntelligenceSkeleton() {
  return (
    <section aria-busy="true" className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
      <div aria-hidden="true" className="h-5 w-40 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
      <div aria-hidden="true" className="mt-3 h-28 w-full animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
    </section>
  );
}

function WorkflowAssembling() {
  return (
    <section aria-busy="true" className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
      <p role="status" aria-live="polite" className="text-sm text-gray-500">
        {COPY.workflow.assembling}
      </p>
      {/* skeleton; motion-reduce keeps it static (AC11 reduced-motion) */}
      <div aria-hidden="true" className="mt-3 h-8 w-44 animate-pulse rounded bg-gray-100 motion-reduce:animate-none" />
    </section>
  );
}

const ISO_4217_RE = /^[A-Z]{3}$/;

// WLT-20: the Dashboard page now renders INSIDE the app shell (the (app) layout
// provides the nav chrome + the AAL2 gate). requireAal2() here is the per-page
// belt-and-suspenders (AC3) + supplies the userId.
// WLT-27-5: reads ?currency= to scope the intelligence section.
export default async function DashboardPage({
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

  const currencies = MULTI_CURRENCY_ENABLED ? await readDistinctCurrencies(userId) : ["USD"];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{COPY.nav.dashboard}</h1>
        {MULTI_CURRENCY_ENABLED ? <RegionSwitcher currencies={currencies} currentCurrency={activeCurrency} /> : null}
      </div>
      {RECAP_ENABLED ? (
        <Suspense fallback={null}>
          <RecapSection userId={userId} />
        </Suspense>
      ) : null}
      <Suspense fallback={<WorkflowAssembling />}>
        <WorkflowSection userId={userId} />
      </Suspense>
      {DASHBOARD_INTELLIGENCE_ENABLED ? (
        <Suspense fallback={<DashboardIntelligenceSkeleton />}>
          <DashboardIntelligenceSection userId={userId} activeCurrency={activeCurrency} />
        </Suspense>
      ) : null}
      <DashboardNudge />
    </div>
  );
}

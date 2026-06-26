import { Suspense } from "react";
import { requireAal2 } from "@vc1023/passkey-2fa";
import { COPY } from "@/app/lib/copy";
import { getRecap } from "@/app/lib/recap";
import { readCategorySpendChart } from "@/app/lib/dashboard-spend";
import { getOrCreateWorkflow } from "@/app/lib/workflow";
import { DashboardNudge } from "./DashboardNudge";
import { RecapCard } from "./RecapCard";
import { WorkflowCard } from "./WorkflowCard";
import { CategorySpendChart } from "./CategorySpendChart";

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

// WLT-26-1: server component that reads the category spend chart and renders it.
async function DashboardIntelligenceSection({ userId }: { userId: string }) {
  const chart = await readCategorySpendChart(userId);
  const C = COPY.dashboardIntelligence;
  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-900">{C.sectionTitle}</h2>
      <CategorySpendChart data={chart} />
    </section>
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

// WLT-20: the Dashboard page now renders INSIDE the app shell (the (app) layout
// provides the nav chrome + the AAL2 gate). requireAal2() here is the per-page
// belt-and-suspenders (AC3) + supplies the userId.
export default async function DashboardPage() {
  const userId = await requireAal2();

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{COPY.nav.dashboard}</h1>
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
          <DashboardIntelligenceSection userId={userId} />
        </Suspense>
      ) : null}
      <DashboardNudge />
    </div>
  );
}

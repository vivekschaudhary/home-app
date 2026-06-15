import { notFound } from "next/navigation";
import { getAal2UserId, getSessionUser } from "@vc1023/passkey-2fa";
import { COPY } from "@/app/lib/copy";
import { type FunnelStage, formatDuration, isAdmin, readMetrics } from "@/app/lib/metrics";

// WLT-13 — the instrument panel. Operator surface: AAL2 + ADMIN_EMAILS gate.
// EVERY unauthorized state (signed-out, non-AAL2, non-admin) returns 404 — the
// route stays unenumerable. We deliberately use getAal2UserId() (returns null),
// NOT requireAal2() (which REDIRECTS to /sign-in and would leak the route's
// existence to unauthenticated callers). Server-rendered tables of cross-user
// AGGREGATES only (n on every figure, no PII, no drill-down); the service-role
// reads stay in this server component — only rendered numbers ship.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STAGE_LABELS: Record<string, string> = {
  signup_started: COPY.metrics.funnelStageSignup,
  mfa_enrolled: COPY.metrics.funnelStageMfa,
  account_linked: COPY.metrics.funnelStageConnected,
  intent_declared: COPY.metrics.funnelStageIntent,
  workflow_assembled: COPY.metrics.funnelStagePlan,
  action_completed: COPY.metrics.funnelStageAction,
};

function conv(stage: FunnelStage, prev: FunnelStage | undefined): string {
  if (!prev || prev.users === 0) return "—";
  return `${Math.round((stage.users / prev.users) * 100)}%${stage.stage === "intent_declared" ? "*" : ""}`;
}

export default async function AdminMetricsPage() {
  // Non-redirecting gate: signed-out / non-AAL2 → null → 404 (NOT a redirect).
  const userId = await getAal2UserId();
  if (!userId) notFound();
  const user = await getSessionUser();
  if (!isAdmin(user?.email)) notFound(); // 404 — not 403; the surface stays unenumerable

  let data: Awaited<ReturnType<typeof readMetrics>>;
  try {
    data = await readMetrics();
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-lg font-semibold text-gray-900">{COPY.metrics.title}</h1>
        <p className="mt-4 text-sm text-red-700">{COPY.metrics.error}</p>
      </main>
    );
  }

  const { ttfv, wawu, returns, anomalies, funnel } = data;
  const totalN = funnel.reduce((max, s) => Math.max(max, s.users), 0);
  const p80 = ttfv.p80TtfvSeconds;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-baseline justify-between border-b border-gray-200 pb-4">
        <h1 className="text-lg font-semibold text-gray-900">{COPY.metrics.title}</h1>
        <p className="text-xs text-gray-500">
          {COPY.metrics.generatedAt.replace("{timestamp}", new Date().toISOString())}
        </p>
      </header>

      {totalN < 5 ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {COPY.metrics.preLaunchBanner.replace("{n}", String(totalN))}
        </p>
      ) : null}

      {/* 1 · TTFV */}
      <section className="mt-8" aria-labelledby="m-ttfv">
        <h2 id="m-ttfv" className="text-base font-semibold text-gray-900">
          {COPY.metrics.ttfvHeading}
        </h2>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
          {COPY.metrics.ttfvP80Label}: {formatDuration(p80)}{" "}
          {p80 !== null ? (
            <span className={`text-sm font-medium ${p80 <= 180 ? "text-green-700" : "text-red-700"}`}>
              {p80 <= 180 ? COPY.metrics.ttfvTargetHit : COPY.metrics.ttfvTargetMiss}
            </span>
          ) : null}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {COPY.metrics.nLabel.replace("{n}", `${ttfv.nCompleted} of ${ttfv.nSignups}`)}
          </span>
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {COPY.metrics.ttfvSplitsHeading}: {COPY.metrics.ttfvSplitConnected}{" "}
          {formatDuration(ttfv.medianSplitLinkedSeconds)} · {COPY.metrics.ttfvSplitPlan}{" "}
          {formatDuration(ttfv.medianSplitAssembledSeconds)} · {COPY.metrics.ttfvSplitAction}{" "}
          {formatDuration(ttfv.medianTtfvSeconds)}
        </p>
      </section>

      {/* 2 · WAWU */}
      <section className="mt-8" aria-labelledby="m-wawu">
        <h2 id="m-wawu" className="text-base font-semibold text-gray-900">
          {COPY.metrics.wawuHeading}
        </h2>
        {wawu.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{COPY.metrics.empty}</p>
        ) : (
          <table className="mt-3 w-full max-w-sm text-sm">
            <caption className="sr-only">{COPY.metrics.wawuHeading}</caption>
            <tbody>
              {wawu.map((w) => (
                <tr key={w.weekStart} className="border-b border-gray-100">
                  <th scope="row" className="py-1.5 text-left font-normal text-gray-600">
                    {COPY.metrics.wawuWeekOf.replace("{date}", w.weekStart)}
                  </th>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{w.wawu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 3 · Return (WLT-16) — weekly recap viewers */}
      <section className="mt-8" aria-labelledby="m-return">
        <h2 id="m-return" className="text-base font-semibold text-gray-900">
          {COPY.metrics.returnHeading}
        </h2>
        {returns.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{COPY.metrics.empty}</p>
        ) : (
          <table className="mt-3 w-full max-w-sm text-sm">
            <caption className="sr-only">{COPY.metrics.returnHeading}</caption>
            <tbody>
              {returns.map((r) => (
                <tr key={r.weekStart} className="border-b border-gray-100">
                  <th scope="row" className="py-1.5 text-left font-normal text-gray-600">
                    {COPY.metrics.wawuWeekOf.replace("{date}", r.weekStart)}
                  </th>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{r.returners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 4 · Anomalies (WLT-18) — precision watch (dismiss-rate) */}
      <section className="mt-8" aria-labelledby="m-anomaly">
        <h2 id="m-anomaly" className="text-base font-semibold text-gray-900">
          {COPY.metrics.anomalyHeading}
        </h2>
        {anomalies.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{COPY.metrics.empty}</p>
        ) : (
          <table className="mt-3 w-full max-w-md text-sm">
            <caption className="sr-only">{COPY.metrics.anomalyHeading}</caption>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th scope="col" className="py-1.5 font-medium">Week</th>
                <th scope="col" className="py-1.5 text-right font-medium">Detected</th>
                <th scope="col" className="py-1.5 text-right font-medium">Acted</th>
                <th scope="col" className="py-1.5 text-right font-medium">Dismissed</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => (
                <tr key={a.weekStart} className="border-b border-gray-100">
                  <th scope="row" className="py-1.5 text-left font-normal text-gray-600">
                    {COPY.metrics.wawuWeekOf.replace("{date}", a.weekStart)}
                  </th>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{a.detected}</td>
                  <td className="py-1.5 text-right text-gray-700">{a.acted}</td>
                  <td className="py-1.5 text-right text-gray-700">
                    {a.dismissed}
                    {a.surfaced > 0 ? (
                      <span className="ml-1 text-gray-400">({Math.round((a.dismissed / a.surfaced) * 100)}%)</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 5 · Funnel */}
      <section className="mt-8" aria-labelledby="m-funnel">
        <h2 id="m-funnel" className="text-base font-semibold text-gray-900">
          {COPY.metrics.funnelHeading}
        </h2>
        <table className="mt-3 w-full max-w-md text-sm">
          <caption className="sr-only">{COPY.metrics.funnelHeading}</caption>
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th scope="col" className="py-1.5 font-medium">{COPY.metrics.funnelColStage}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{COPY.metrics.funnelColUsers}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{COPY.metrics.funnelColConv}</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((s, i) => (
              <tr key={s.stage} className="border-b border-gray-100">
                <th scope="row" className="py-1.5 text-left font-normal text-gray-700">
                  {STAGE_LABELS[s.stage] ?? s.stage}
                </th>
                <td className="py-1.5 text-right font-semibold text-gray-900">{s.users}</td>
                <td className="py-1.5 text-right text-gray-600">{conv(s, funnel[i - 1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">{COPY.metrics.funnelIntentFootnote}</p>
      </section>
    </main>
  );
}

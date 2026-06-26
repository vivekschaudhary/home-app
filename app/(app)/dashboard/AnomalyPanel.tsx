// WLT-26-2 — Anomaly Panel RSC. Reads open/surfaced new_merchant + category_spike
// anomalies and delegates rendering + dismiss to AnomalyPanelClient.
//
// History gate: < 2 months of transactions → shows the no-history empty state
// (the detector output is statistically meaningless on short history; brief §AC7).

import { readDashboardAnomalies } from "@/app/lib/anomaly";
import { COPY } from "@/app/lib/copy";
import { AnomalyPanelClient } from "./AnomalyPanelClient";

const C = COPY.dashboardIntelligence;

export async function AnomalyPanel({ userId }: { userId: string }) {
  const { anomalies, monthsOfHistory } = await readDashboardAnomalies(userId);

  return (
    <section aria-label={C.anomalyPanelTitle} className="mt-4">
      <h2 className="text-base font-semibold text-gray-900">{C.anomalyPanelTitle}</h2>

      {monthsOfHistory < 2 ? (
        <p className="mt-2 text-sm text-gray-500">{C.anomalyEmptyNoHistory}</p>
      ) : (
        <AnomalyPanelClient initialAnomalies={anomalies} />
      )}
    </section>
  );
}

// WLT-26-2 — Anomaly panel RSC. Reads open/surfaced dashboard anomalies
// (new_merchant + category_spike only) and renders the panel or the appropriate
// empty state. Interactive parts (dismiss + investigate) live in AnomalyPanelClient.

import { readDashboardAnomalies } from "@/app/lib/anomaly";
import { COPY } from "@/app/lib/copy";
import { AnomalyPanelClient } from "./AnomalyPanelClient";

const C = COPY.dashboardIntelligence;

export async function AnomalyPanel({ userId }: { userId: string }) {
  const { anomalies, monthsOfHistory } = await readDashboardAnomalies(userId);

  // < 2 months of history → detector hasn't had enough data; honest empty state.
  if (monthsOfHistory < 2) {
    return (
      <p className="mb-4 text-sm text-gray-500">{C.anomalyEmptyNoHistory}</p>
    );
  }

  // Enough history but nothing flagged → positive "all clear" state.
  if (anomalies.length === 0) {
    return (
      <p className="mb-4 text-sm text-gray-500">{C.anomalyEmptyNoAnomalies}</p>
    );
  }

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-medium text-gray-700">{C.anomalyPanelTitle}</h3>
      <AnomalyPanelClient anomalies={anomalies} />
    </div>
  );
}

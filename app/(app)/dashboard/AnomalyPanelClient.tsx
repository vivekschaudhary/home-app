"use client";

// WLT-26-2 — Anomaly panel client component. Handles optimistic dismiss +
// investigate navigation. Receives pre-fetched DashboardAnomaly[] from the
// AnomalyPanel RSC (which owns the readDashboardAnomalies call).

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardAnomaly } from "@/app/lib/anomaly";
import { COPY } from "@/app/lib/copy";

const C = COPY.dashboardIntelligence;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function investigateHref(anomaly: DashboardAnomaly): string {
  const params = new URLSearchParams();
  if (anomaly.kind === "category_spike") {
    if (anomaly.rawCategory) params.set("category", anomaly.rawCategory);
    if (anomaly.spikeMonth) params.set("month", anomaly.spikeMonth);
  } else {
    // new_merchant: show the debut month so the user can find the charge.
    const date = anomaly.summary.date as string | undefined;
    if (date) params.set("month", date.slice(0, 7));
  }
  return `/transactions?${params.toString()}`;
}

function anomalyPhrasing(anomaly: DashboardAnomaly): string {
  if (anomaly.kind === "new_merchant") {
    if (!anomaly.merchantName) return C.anomalyKindNewMerchantUnknown;
    return fill(C.anomalyKindNewMerchant, { merchantName: anomaly.merchantName });
  }
  const summary = anomaly.summary as { category?: string; multiple?: number };
  return fill(C.anomalyKindCategorySpike, {
    category: summary.category ?? "",
    multiple: summary.multiple != null ? String(Math.round(summary.multiple * 10) / 10) : "",
  });
}

function dismissLabel(anomaly: DashboardAnomaly): string {
  return anomaly.kind === "new_merchant" ? C.anomalyDismissNewMerchant : C.anomalyDismissMonthly;
}

function dismissSrLabel(anomaly: DashboardAnomaly): string {
  if (anomaly.kind === "new_merchant") {
    return fill(C.anomalyDismissNewMerchantSrLabel, {
      merchantName: anomaly.merchantName ?? C.anomalyKindNewMerchantUnknown,
    });
  }
  const summary = anomaly.summary as { category?: string };
  return fill(C.anomalyDismissMonthlySrLabel, {
    category: summary.category ?? "",
    month: anomaly.spikeMonth ?? "",
  });
}

export function AnomalyPanelClient({ anomalies }: { anomalies: DashboardAnomaly[] }) {
  const router = useRouter();
  const [visibleIds, setVisibleIds] = useState(() => anomalies.map((a) => a.id));

  const visible = anomalies.filter((a) => visibleIds.includes(a.id));

  function handleDismiss(id: string) {
    // Optimistic: remove from the list immediately.
    setVisibleIds((prev) => prev.filter((x) => x !== id));
    void fetch(`/api/anomaly/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
  }

  function handleInvestigate(anomaly: DashboardAnomaly) {
    const href = investigateHref(anomaly);
    try {
      void fetch("/api/anomaly/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomaly_kind: anomaly.kind }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* non-blocking */
    }
    router.push(href);
  }

  if (visible.length === 0) return null;

  return (
    <ul className="mb-4 space-y-2" role="list" aria-label={C.anomalyPanelTitle}>
      {visible.map((anomaly) => (
        <li
          key={anomaly.id}
          className="flex items-start justify-between gap-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm"
        >
          <span className="flex-1 text-gray-800">{anomalyPhrasing(anomaly)}</span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handleInvestigate(anomaly)}
              className="text-gray-600 underline hover:text-gray-900"
            >
              {C.anomalyInvestigate}
            </button>
            <button
              type="button"
              onClick={() => handleDismiss(anomaly.id)}
              className="text-gray-500 hover:text-gray-700"
              aria-label={dismissSrLabel(anomaly)}
            >
              <span aria-hidden="true">{dismissLabel(anomaly)}</span>
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

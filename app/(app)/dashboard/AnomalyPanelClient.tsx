"use client";

// WLT-26-2 — AnomalyPanel client-side shell. Manages optimistic dismiss state.
// The RSC parent (AnomalyPanel.tsx) passes the initial anomaly list; this client
// component owns the dismissed-id set and calls PATCH /api/anomaly/[id].

import { useState } from "react";
import Link from "next/link";
import { COPY } from "@/app/lib/copy";
import type { DashboardAnomaly } from "@/app/lib/anomaly";

const C = COPY.dashboardIntelligence;

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Fire-and-forget ANOMALY_INVESTIGATED funnel emit (→ route handler). */
function emitInvestigated(kind: string): void {
  try {
    void fetch("/api/dashboard/anomaly-investigated", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anomaly_kind: kind }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

export function AnomalyPanelClient({ initialAnomalies }: { initialAnomalies: DashboardAnomaly[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  const visible = initialAnomalies.filter((a) => !dismissed.has(a.id));

  async function handleDismiss(id: string) {
    if (dismissing.has(id)) return;
    setDismissing((prev) => new Set([...prev, id]));
    try {
      const res = await fetch(`/api/anomaly/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (res.ok) {
        setDismissed((prev) => new Set([...prev, id]));
      }
    } finally {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (visible.length === 0) {
    return <p className="mt-2 text-sm text-gray-500">{C.anomalyEmptyNoAnomalies}</p>;
  }

  return (
    <ul className="mt-2 space-y-3">
      {visible.map((anomaly) => {
        const summaryAny = anomaly.summary as Record<string, unknown>;
        const isBusy = dismissing.has(anomaly.id);

        // Investigate URL per kind
        let investigateHref = "/transactions";
        if (anomaly.kind === "category_spike" && anomaly.rawCategory && anomaly.debutMonth) {
          investigateHref = `/transactions?category=${encodeURIComponent(anomaly.rawCategory)}&month=${anomaly.debutMonth}`;
        } else if (anomaly.kind === "new_merchant" && anomaly.debutMonth) {
          investigateHref = `/transactions?month=${anomaly.debutMonth}`;
        }

        // Per-kind phrasing
        let phrasedText: string;
        let dismissLabel: string;
        let dismissSrLabel: string;

        if (anomaly.kind === "new_merchant") {
          if (anomaly.merchantName) {
            phrasedText = fill(C.anomalyKindNewMerchant, { merchantName: anomaly.merchantName });
          } else {
            phrasedText = C.anomalyKindNewMerchantUnknown;
          }
          dismissLabel = C.anomalyDismissNewMerchant;
          dismissSrLabel = fill(C.anomalyDismissNewMerchantSrLabel, {
            merchantName: anomaly.merchantName ?? "this merchant",
          });
        } else {
          const categoryLabel = String(summaryAny.category ?? "");
          const multipleLabel = String(
            typeof summaryAny.multiple === "number" ? summaryAny.multiple.toFixed(1) : summaryAny.multiple ?? "",
          );
          phrasedText = fill(C.anomalyKindCategorySpike, { categoryLabel, multipleLabel });
          dismissLabel = C.anomalyDismissMonthly;
          dismissSrLabel = fill(C.anomalyDismissMonthlySrLabel, {
            category: categoryLabel,
            month: anomaly.debutMonth ?? "",
          });
        }

        return (
          <li key={anomaly.id} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
            <p className="text-gray-800">{phrasedText}</p>
            <div className="mt-2 flex gap-3">
              <Link
                href={investigateHref}
                className="text-blue-600 hover:underline"
                onClick={() => emitInvestigated(anomaly.kind)}
              >
                {C.anomalyInvestigate}
              </Link>
              <button
                type="button"
                onClick={() => void handleDismiss(anomaly.id)}
                disabled={isBusy}
                className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                aria-label={dismissSrLabel}
              >
                {isBusy ? "…" : dismissLabel}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

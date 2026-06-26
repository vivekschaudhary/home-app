"use client";

// WLT-26-1 — the category spend bar chart (Dashboard Intelligence). Custom SVG
// bar chart (no charting dependency — architecture decision). 10 bars (current-
// month spend per category) + a dashed horizontal reference line per bar at the
// rolling-average amount. Each bar is a link to the WLT-23 ledger pre-filtered
// to that category + month. SVG is aria-hidden; sr-only table is the a11y twin
// (the YearSpread.tsx idiom).

import { useRouter } from "next/navigation";
import type { CategorySpendChart as CategorySpendChartData } from "@wealth/core";
import { COPY } from "@/app/lib/copy";

const C = COPY.dashboardIntelligence;

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

/** Abbreviated display label for an SVG axis (first word, max 5 chars). */
function shortLabel(label: string): string {
  return (label.split(" ")[0] ?? "").slice(0, 5);
}

function avgLegendLabel(monthsOfHistory: number): string {
  if (monthsOfHistory >= 6) return C.avgLegendFull;
  return fill(C.avgLegendPartial, { n: String(monthsOfHistory) });
}

function barHref(category: string, currentMonth: string): string {
  const params = new URLSearchParams();
  if (category !== null) params.set("category", category);
  params.set("month", currentMonth);
  return `/transactions?${params.toString()}`;
}

// SVG geometry (mirrors YearSpread.tsx proportions)
const W = 360;
const CH = 80; // chart height
const LABEL_H = 24; // height for rotated category labels below the chart
const SVG_H = CH + LABEL_H;

export function CategorySpendChart({ data }: { data: CategorySpendChartData }) {
  const router = useRouter();
  const { bars, monthsOfHistory, currentMonth } = data;

  const hasData = bars.length > 0;
  const showAvgLine = monthsOfHistory >= 2;

  if (!hasData && monthsOfHistory < 2) {
    return (
      <p className="mt-2 text-sm text-gray-500">{C.categoryChartEmptyNoHistory}</p>
    );
  }
  if (!hasData) {
    return (
      <p className="mt-2 text-sm text-gray-500">{C.categoryChartEmptyNoSpend}</p>
    );
  }

  const N = bars.length;
  const STEP = W / N;
  const BAR_W = Math.max(STEP - 8, 4);

  const maxVal = Math.max(...bars.map((b) => Math.max(b.currentMonth, b.average ?? 0)), 1);

  function handleBarClick(href: string) {
    try {
      void fetch("/api/dashboard/category-bar-clicked", { method: "POST", keepalive: true }).catch(() => {});
    } catch {
      /* non-blocking */
    }
    router.push(href);
  }

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-700">{C.categoryChartTitle}</p>

      {/* aria-hidden SVG — the sr-only table below is the a11y surface */}
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        className="mt-1 h-28 w-full"
        role="img"
        aria-hidden="true"
      >
        {bars.map((bar, i) => {
          const barH = (bar.currentMonth / maxVal) * CH;
          const x = i * STEP + (STEP - BAR_W) / 2;
          const y = CH - barH;
          const href = barHref(bar.category, currentMonth);
          const avgY = bar.average != null && showAvgLine ? CH - (bar.average / maxVal) * CH : null;
          const labelX = i * STEP + STEP / 2;

          return (
            <g
              key={bar.category}
              style={{ cursor: "pointer" }}
              onClick={() => handleBarClick(href)}
            >
              <rect
                x={x}
                y={Math.min(y, CH - 1)}
                width={BAR_W}
                height={Math.max(barH, bar.currentMonth > 0 ? 1 : 0)}
                rx={1.5}
                className="fill-gray-800"
              >
                <title>{`${bar.label}: ${money(bar.currentMonth)}${bar.average != null ? ` (avg ${money(bar.average)})` : ""}`}</title>
              </rect>

              {/* per-bar dashed average reference line */}
              {avgY != null && (
                <line
                  x1={i * STEP}
                  y1={avgY}
                  x2={i * STEP + STEP}
                  y2={avgY}
                  stroke="#9ca3af"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}

              {/* abbreviated category label, rotated -45° */}
              <text
                x={labelX}
                y={CH + 4}
                textAnchor="end"
                transform={`rotate(-45, ${labelX}, ${CH + 4})`}
                className="fill-gray-500"
                fontSize={8}
              >
                {shortLabel(bar.label)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* avg legend */}
      {showAvgLine && (
        <p className="text-[11px] text-gray-500">
          <span className="mr-1 inline-block w-4 border-t border-dashed border-gray-400 align-middle" />
          {avgLegendLabel(monthsOfHistory)}
        </p>
      )}

      {/* Screen-reader equivalent — the load-bearing a11y surface (YearSpread idiom). */}
      <table className="sr-only">
        <caption>{C.categoryChartTableCaption}</caption>
        <tbody>
          {bars.map((bar) => {
            const href = barHref(bar.category, currentMonth);
            const srLabel = fill(C.categoryBarClickedSrLabel, {
              category: bar.label,
              month: currentMonth,
            });
            return (
              <tr key={bar.category}>
                <td>
                  <a href={href} onClick={() => handleBarClick(href)}>
                    {srLabel}
                  </a>
                </td>
                <td>{money(bar.currentMonth)}</td>
                <td>{bar.average != null ? money(bar.average) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

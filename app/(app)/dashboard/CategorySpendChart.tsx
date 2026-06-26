"use client";

// WLT-26-1 — Category spend bar chart. Custom SVG (no charting dependency) following
// the YearSpread.tsx idiom: aria-hidden SVG + sr-only data table. Each bar is a link
// to the WLT-23 ledger pre-filtered to ?category=<slug>&month=<YYYY-MM>. A dashed
// reference line at the per-category average mirrors the YearSpread cap-line pattern.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { COPY } from "@/app/lib/copy";
import type { CategorySpendChart as CategorySpendChartData } from "@wealth/core/dashboard-spend";

const C = COPY.dashboardIntelligence;

// SVG geometry — mirrors YearSpread layout (360 × chart-height viewBox).
const W = 360;
const CH = 80; // chart area height
const N = 10; // max bars
const STEP = W / N; // 36px per bar slot
const BAR_W = STEP - 8; // 28px bar width

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

/** Label: first ~7 chars of the humanized category, truncated for the x-axis. */
function shortLabel(label: string): string {
  return label.length > 7 ? label.slice(0, 7) : label;
}

/** The dynamic avg legend string based on monthsOfHistory. */
function avgLegend(monthsOfHistory: number): string {
  if (monthsOfHistory >= 6) return "6-month avg";
  return `${monthsOfHistory}-month avg (${monthsOfHistory} months)`;
}

/** Fire-and-forget funnel emit for the bar click (→ the route handler). */
function emitBarClick(category: string, month: string): void {
  try {
    void fetch("/api/dashboard/category-bar-clicked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, month }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort; navigation must not block
  }
}

export function CategorySpendChart({ data, currentMonth }: { data: CategorySpendChartData; currentMonth: string }) {
  const router = useRouter();
  const { bars: allBars, monthsOfHistory } = data;
  // Defensive cap: geometry constants assume ≤ N bars (STEP = W/N).
  const bars = allBars.slice(0, N);

  if (monthsOfHistory < 2) {
    return <p className="mt-2 text-sm text-gray-500">{C.categoryChartEmptyNoHistory}</p>;
  }

  if (bars.length === 0) {
    return <p className="mt-2 text-sm text-gray-500">{C.categoryChartEmptyNoSpend}</p>;
  }

  const max = Math.max(...bars.map((b) => Math.max(b.currentMonth, b.average ?? 0)), 1);
  const hasAverage = bars.some((b) => b.average !== null);

  return (
    <div className="mt-2">
      {/* Decorative SVG — screen readers use the table below. Each <g> is clickable
          for sighted users; aria-hidden hides the SVG so only the sr-only table is
          announced. */}
      <svg
        viewBox={`0 0 ${W} ${CH + 2}`}
        className="mt-1 h-24 w-full"
        aria-hidden="true"
      >
        {bars.map((bar, i) => {
          const barH = Math.max((bar.currentMonth / max) * CH, bar.currentMonth > 0 ? 1 : 0);
          const x = i * STEP + (STEP - BAR_W) / 2;
          const y = CH - barH;
          const avgY = bar.average !== null ? CH - (bar.average / max) * CH : null;
          const href = `/transactions?category=${encodeURIComponent(bar.category)}&month=${currentMonth}`;

          return (
            <g
              key={bar.category}
              className="cursor-pointer"
              onClick={() => {
                router.push(href);
                emitBarClick(bar.category, currentMonth);
              }}
            >
              {/* Transparent full-slot hit area — larger click target than the bar alone. */}
              <rect x={i * STEP} y={0} width={STEP} height={CH} className="fill-transparent" />
              <rect
                x={x}
                y={Math.min(y, CH - 1)}
                width={BAR_W}
                height={round2(barH)}
                rx={1.5}
                className="fill-gray-800"
              >
                <title>{`${bar.label}: ${money(bar.currentMonth)}${bar.average !== null ? ` (avg ${money(bar.average)})` : ""}`}</title>
              </rect>
              {/* Per-bar average reference line — dashed, mirroring YearSpread cap-line */}
              {avgY !== null ? (
                <line
                  x1={x}
                  y1={avgY}
                  x2={x + BAR_W}
                  y2={avgY}
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* X-axis labels — one visible tick label per bar. */}
      <div className="flex" aria-hidden="true">
        {bars.map((bar) => (
          <span
            key={bar.category}
            className="flex-1 text-center text-[9px] text-gray-500 overflow-hidden"
          >
            {shortLabel(bar.label)}
          </span>
        ))}
      </div>

      {/* Avg legend */}
      {hasAverage ? (
        <p className="mt-1 text-[11px] text-gray-500">
          <span className="inline-block mr-1 w-4 border-t border-dashed border-gray-400 align-middle" />
          {avgLegend(monthsOfHistory)}
        </p>
      ) : null}

      {/* The load-bearing a11y surface: sr-only table + per-bar links. */}
      <table className="sr-only">
        <caption>{C.categoryChartTableCaption}</caption>
        <tbody>
          {bars.map((bar) => {
            const href = `/transactions?category=${encodeURIComponent(bar.category)}&month=${currentMonth}`;
            const srLabel = fill(C.categoryBarClickedSrLabel, {
              category: bar.label,
              month: currentMonth,
            });
            return (
              <tr key={bar.category}>
                <td>
                  <Link
                    href={href}
                    onClick={() => emitBarClick(bar.category, currentMonth)}
                  >
                    {srLabel}
                  </Link>
                </td>
                <td>{money(bar.currentMonth)}</td>
                {bar.average !== null ? <td>avg {money(bar.average)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

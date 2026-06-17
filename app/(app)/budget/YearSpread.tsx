import { COPY } from "@/app/lib/copy";

// WLT-21-2 — a category's 12-month spend, drawn as a custom SVG bar chart (no
// charting dependency). The SVG is aria-hidden (decorative); the visually-hidden
// data table is the screen-reader equivalent (AC5). Real zeros, never fabricated;
// the current (partial) month is marked distinctly + "so far".

const Y = COPY.budgetYear;
const A = COPY.budgetYearA11y;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
function monthIndex(key: string): number {
  return Math.max(0, Math.min(11, Number(key.slice(5, 7)) - 1));
}

// viewBox geometry
const W = 360;
const CH = 70; // chart height
const STEP = W / 12;
const BAR_W = STEP - 10;

export function YearSpread({
  label,
  points,
  months,
  cap,
}: {
  label: string;
  points: number[];
  months: string[];
  cap?: number | null;
}) {
  const max = Math.max(...points, cap ?? 0, 1);
  const lastIndex = points.length - 1;
  const capY = cap != null ? CH - (cap / max) * CH : null;

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-700">{fill(Y.caption, { category: label })}</p>
      <p className="text-[11px] text-gray-500">{fill(Y.maxLabel, { amount: money(Math.max(...points, 0)) })}</p>

      <svg viewBox={`0 0 ${W} ${CH + 18}`} className="mt-1 h-24 w-full" role="img" aria-hidden="true">
        {capY != null ? (
          <line x1={0} y1={capY} x2={W} y2={capY} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" />
        ) : null}
        {points.map((v, i) => {
          const barH = (v / max) * CH;
          const x = i * STEP + (STEP - BAR_W) / 2;
          const y = CH - barH;
          const isCurrent = i === lastIndex;
          const monthFull = MONTHS_FULL[monthIndex(months[i] ?? "")];
          return (
            <g key={i}>
              <rect
                x={x}
                y={Math.min(y, CH - 1)}
                width={BAR_W}
                height={Math.max(barH, v > 0 ? 1 : 0)}
                rx={1.5}
                className={isCurrent ? "fill-gray-300" : "fill-gray-800"}
                stroke={isCurrent ? "#374151" : "none"}
                strokeDasharray={isCurrent ? "2 2" : undefined}
              >
                <title>{`${monthFull}${isCurrent ? ` (${Y.soFar})` : ""}: ${money(v)}`}</title>
              </rect>
              {/* baseline tick so a $0 month still reads as a real, present zero */}
              {v === 0 ? <line x1={x} y1={CH} x2={x + BAR_W} y2={CH} stroke="#e5e7eb" strokeWidth={1} /> : null}
              <text x={i * STEP + STEP / 2} y={CH + 13} textAnchor="middle" className="fill-gray-500 text-[9px]">
                {MONTHS_SHORT[monthIndex(months[i] ?? "")]}
              </text>
            </g>
          );
        })}
      </svg>

      {cap != null ? <p className="text-[11px] text-gray-500">{fill(Y.capLegend, { amount: money(cap) })}</p> : null}

      {/* The screen-reader equivalent — the load-bearing accessibility surface. */}
      <table className="sr-only">
        <caption>{fill(A.seriesCaption, { category: label })}</caption>
        <tbody>
          {points.map((v, i) => {
            const monthFull = MONTHS_FULL[monthIndex(months[i] ?? "")];
            const isCurrent = i === lastIndex;
            return (
              <tr key={i}>
                <td>{fill(isCurrent ? A.currentMonth : A.monthAmount, { month: monthFull, amount: money(v) })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

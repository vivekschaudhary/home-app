import { Banner } from "@wealth/ui";
import type { CategoryTxnDTO } from "@/app/lib/budget-client";
import { COPY } from "@/app/lib/copy";

// WLT-22-1 — the line items behind a category's "this month so far" number.
// Presentational: BudgetClient owns the fetch/cache (so it fetches once per
// category per load); this renders loading / error / empty / the list + Total.

const D = COPY.budgetDrill;
const DA = COPY.budgetDrillA11y;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function money(n: number): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function shortDate(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${MONTHS[m - 1] ?? ""} ${d}`;
}
function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export type DrillState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; items: CategoryTxnDTO[]; total: number };

export function CategoryTransactions({
  label,
  state,
  onRetry,
}: {
  label: string;
  state: DrillState;
  onRetry: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={fill(DA.list, { category: label })}
      className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3"
    >
      <p className="text-xs font-medium text-gray-700">{fill(D.panelHeading, { category: label })}</p>

      {state.status === "loading" ? (
        <p aria-busy="true" className="mt-2 text-sm text-gray-500">
          {D.loading}
        </p>
      ) : state.status === "error" ? (
        <div className="mt-2 space-y-2">
          <Banner variant="error">{D.error}</Banner>
          <button type="button" onClick={onRetry} className="text-sm font-medium text-gray-700 underline">
            {D.retry}
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{fill(D.empty, { category: label })}</p>
      ) : (
        <table className="mt-2 w-full text-sm" aria-label={fill(DA.list, { category: label })}>
          <thead className="sr-only">
            <tr>
              <th scope="col">{DA.colDate}</th>
              <th scope="col">{DA.colMerchant}</th>
              <th scope="col">{DA.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                <td className="whitespace-nowrap py-1 pr-3 align-top text-gray-500">{shortDate(it.occurredOn)}</td>
                <td className="max-w-[40ch] truncate py-1 pr-3 text-gray-900">{it.merchant ?? it.description}</td>
                <td className="whitespace-nowrap py-1 text-right font-medium text-gray-900">{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                {D.totalLabel}
              </td>
              <td className="pt-2 text-right font-semibold text-gray-900">{money(state.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

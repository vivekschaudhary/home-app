import { type ReactNode } from "react";
import { StatusChip } from "./StatusChip";

type Status = "connected" | "syncing" | "needs_reauth" | "error";

interface AccountCardProps {
  institutionName: string | null;
  accountName: string;
  kind: string;
  mask: string | null;
  balance: string | null; // decimal-as-string
  currency?: string;
  status: Status;
  statusLabel: string;
  lastSyncedLabel?: string | null;
  /** Full screen-reader label (copy.md a11y.accountCard). */
  ariaLabel: string;
  action?: ReactNode;
}

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** One connected account: institution + name + type + balance + status + action. */
export function AccountCard({
  institutionName,
  accountName,
  kind,
  mask,
  balance,
  currency = "USD",
  status,
  statusLabel,
  lastSyncedLabel,
  ariaLabel,
  action,
}: AccountCardProps) {
  return (
    <li
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900">
            {institutionName ?? accountName}
          </p>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
            {kind}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {accountName}
          {mask ? ` ····${mask}` : ""}
          {lastSyncedLabel ? ` · ${lastSyncedLabel}` : ""}
        </p>
        <div className="mt-1.5">
          <StatusChip status={status} label={statusLabel} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {balance != null ? (
          <p className="text-sm font-semibold text-gray-900">{formatMoney(balance, currency)}</p>
        ) : null}
        {action}
      </div>
    </li>
  );
}

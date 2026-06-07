import { type ReactNode } from "react";

interface FactorRowProps {
  label: string;
  status: string;
  enrolled: boolean;
  action?: ReactNode;
}

/** A row in the Security page factor list: name + status + optional action. */
export function FactorRow({ label, status, enrolled, action }: FactorRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className={`text-xs ${enrolled ? "text-green-700" : "text-gray-500"}`}>
          {enrolled ? "✓ " : ""}
          {status}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type Status = "connected" | "syncing" | "needs_reauth" | "error";

const STYLES: Record<Status, string> = {
  connected: "bg-green-50 text-green-700 ring-green-600/20",
  syncing: "bg-blue-50 text-blue-700 ring-blue-600/20",
  needs_reauth: "bg-amber-50 text-amber-800 ring-amber-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
};

// Status indicator carrying BOTH an icon glyph and the text label — never
// color-only (WCAG: don't encode meaning in color alone).
const GLYPH: Record<Status, string> = {
  connected: "●",
  syncing: "◌",
  needs_reauth: "▲",
  error: "▲",
};

export function StatusChip({ status, label }: { status: Status; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={status === "syncing" ? "motion-safe:animate-pulse" : ""}>
        {GLYPH[status]}
      </span>
      {label}
    </span>
  );
}

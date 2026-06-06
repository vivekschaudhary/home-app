import type { ReactNode } from "react";

interface BannerProps {
  variant?: "error" | "info";
  children: ReactNode;
}

/** Discriminated banner. Errors are never color-only — an icon + text carry the
 *  meaning (WCAG: don't rely on color alone). role=alert for errors. */
export function Banner({ variant = "error", children }: BannerProps) {
  const isError = variant === "error";
  const styles = isError
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-blue-200 bg-blue-50 text-blue-800";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${styles}`}
    >
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {isError ? (
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7a1 1 0 112 0v4a1 1 0 11-2 0V7zm1 7a1 1 0 100 2 1 1 0 000-2z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

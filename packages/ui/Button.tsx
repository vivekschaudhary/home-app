import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  loading?: boolean;
  /** Label shown while loading (copy.md `*.cta.loading`). Falls back to children. */
  loadingLabel?: ReactNode;
  children: ReactNode;
}

function Spinner() {
  return (
    <svg
      className="mr-2 h-4 w-4 motion-safe:animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, loadingLabel, children, disabled, className = "", ...rest },
  ref,
) {
  const base =
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-gray-800 focus-visible:ring-gray-900"
      : "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-400";
  return (
    <button
      ref={ref}
      className={`${base} ${styles} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
});

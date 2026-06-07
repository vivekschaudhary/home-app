import { forwardRef, type InputHTMLAttributes } from "react";

interface CodeInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
  /** Screen-reader hint associated with the field (copy `a11y.code.hint`). */
  hint?: string;
}

/** A single 6-digit numeric code field (authenticator codes). Keyboard/AT
 *  friendly: numeric inputmode, one-time-code autocomplete, paste fills it. */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { label, error, hint, id, name = "code", className = "", ...rest },
  ref,
) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={6}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block w-full rounded-md border px-3 py-2 text-center text-lg tracking-[0.4em] text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 ${
          error ? "border-red-500" : "border-gray-300"
        } ${className}`}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});

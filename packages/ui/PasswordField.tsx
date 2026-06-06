"use client";

import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
  helper?: string;
  /** copy.md `a11y.password.show` / `a11y.password.hide` / `a11y.capslock` — verbatim. */
  showLabel: string;
  hideLabel: string;
  capsLockLabel: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { label, error, helper, showLabel, hideLabel, capsLockLabel, id, name, className = "", ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const inputId = id ?? name ?? "password";
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const capsId = `${inputId}-caps`;

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }

  const describedBy =
    [
      error ? errorId : null,
      helper && !error ? helperId : null,
      capsOn ? capsId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          ref={ref}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onKeyUp={onKey}
          onKeyDown={onKey}
          className={`block w-full rounded-md border px-3 py-2 pr-20 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 ${
            error ? "border-red-500" : "border-gray-300"
          } ${className}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 rounded-r-md px-3 text-xs font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          {visible ? hideLabel : showLabel}
        </button>
      </div>
      {capsOn ? (
        <p id={capsId} role="status" className="text-xs text-amber-700">
          {capsLockLabel}
        </p>
      ) : null}
      {helper && !error ? (
        <p id={helperId} className="text-xs text-gray-500">
          {helper}
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

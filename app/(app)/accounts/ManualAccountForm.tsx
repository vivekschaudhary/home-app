"use client";

// WLT-27-2 — ManualAccountForm: create a manual (non-Plaid) financial account.
// Rendered only when MANUAL_ACCOUNTS_ENABLED is true (checked in the parent RSC).
// Uses fetch('/api/accounts') — cannot import @wealth/db directly (client-server
// boundary rule; follows the recordTransactionsFiltered pattern).

import { useRef, useState } from "react";
import { COPY } from "@/app/lib/copy";

const C = COPY.manualAccount;

type UserKind = "checking" | "savings" | "credit" | "investment" | "other";

const KIND_OPTIONS: { value: UserKind; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit card" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

// USD always allowed; non-USD listed for when MULTI_CURRENCY_ACCOUNTS_ENABLED is on.
const CURRENCY_OPTIONS = [
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "JPY", label: "Japanese Yen (JPY)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "CNY", label: "Chinese Yuan (CNY)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "MXN", label: "Mexican Peso (MXN)" },
];

export function ManualAccountForm({
  multiCurrencyEnabled,
  onSuccess,
  onCancel,
}: {
  multiCurrencyEnabled: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [kind, setKind] = useState<UserKind>("checking");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!name.trim()) {
      setFieldError(C.errorNameRequired);
      nameRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), institutionName: institutionName.trim() || undefined, kind, currency }),
      });
      const json = (await res.json()) as { error?: string; message?: string; account?: unknown };

      if (!res.ok) {
        if (json.error === "MANUAL_ACCOUNTS_DISABLED") {
          setError(C.errorDisabled);
        } else if (json.error === "MULTI_CURRENCY_DISABLED") {
          setError(C.errorCurrency);
        } else if (json.error === "validation" && json.message) {
          setFieldError(json.message as string);
        } else {
          setError(C.errorNetwork);
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 800);
    } catch {
      setError(C.errorNetwork);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        {C.success}
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="manual-account-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="manual-account-form-title" className="text-lg font-semibold text-gray-900">
          {C.formTitle}
        </h2>

        {error ? (
          <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          {/* Account name */}
          <div>
            <label htmlFor="manual-name" className="block text-sm font-medium text-gray-700">
              {C.nameLabel}
            </label>
            <input
              ref={nameRef}
              id="manual-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={C.namePlaceholder}
              autoFocus
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-describedby={fieldError ? "manual-name-error" : undefined}
            />
            {fieldError ? (
              <p id="manual-name-error" role="alert" className="mt-1 text-xs text-red-600">
                {fieldError}
              </p>
            ) : null}
          </div>

          {/* Institution name (optional) */}
          <div>
            <label htmlFor="manual-institution" className="block text-sm font-medium text-gray-700">
              {C.institutionLabel} <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="manual-institution"
              type="text"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Account type */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">{C.kindLegend}</legend>
            <div className="mt-2 space-y-2">
              {KIND_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="kind"
                    value={opt.value}
                    checked={kind === opt.value}
                    onChange={() => setKind(opt.value)}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Currency */}
          <div>
            <label htmlFor="manual-currency" className="block text-sm font-medium text-gray-700">
              {C.currencyLabel}
            </label>
            {multiCurrencyEnabled ? (
              <select
                id="manual-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <select
                  id="manual-currency"
                  value="USD"
                  disabled
                  aria-describedby="currency-locked-hint"
                  className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm"
                >
                  <option value="USD">US Dollar (USD)</option>
                </select>
                <span id="currency-locked-hint" className="shrink-0 text-xs text-gray-400">
                  {C.currencyLockedHint}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Adding…" : C.submitCta}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {C.cancelCta}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

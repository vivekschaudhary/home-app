"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { APPLE_CARD_PRESET } from "@wealth/aggregation/csv/apple-card";
import { Banner, Button } from "@wealth/ui";
import { COPY } from "@/app/lib/copy";

const MAX_ROWS = 10_000;

export interface CsvImportWizardProps {
  accountId: string;
  accountCurrency: string;
  onDone: () => void;
  onCancel: () => void;
}

interface ParsedFile {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
}

interface Mapping {
  date: string;
  description: string;
  /** Single signed-amount column (non-split mode). */
  amount: string;
  /** Optional: column containing "debit"/"credit" text. Empty = infer from amount sign. */
  direction: string;
  /** Optional category column. */
  category: string;
  /** When true: use debitColumn + creditColumn instead of amount + direction. */
  splitMode: boolean;
  debitColumn: string;
  creditColumn: string;
}

interface MappedRow {
  occurredOn: string;
  description: string;
  amount: string;
  direction: "debit" | "credit";
  category: string | null;
  /** True when direction/amount could not be resolved from the raw row. */
  hasError: boolean;
}

interface ImportResult {
  inserted: number;
  superseded: number;
  removed: number;
}

type ImportError = "row-limit" | "network" | "server";
type Step = 1 | 2 | 3 | 4;

const EMPTY_MAPPING: Mapping = {
  date: "",
  description: "",
  amount: "",
  direction: "",
  category: "",
  splitMode: false,
  debitColumn: "",
  creditColumn: "",
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (mmddyyyy) {
    return `${mmddyyyy[3]}-${mmddyyyy[1].padStart(2, "0")}-${mmddyyyy[2].padStart(2, "0")}`;
  }
  const mmddyyyy2 = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(raw);
  if (mmddyyyy2) {
    return `${mmddyyyy2[3]}-${mmddyyyy2[1].padStart(2, "0")}-${mmddyyyy2[2].padStart(2, "0")}`;
  }
  return raw;
}

function parseSigned(raw: string): { amount: string; direction: "debit" | "credit" } | null {
  const n = parseFloat(raw.replace(/[$, ]/g, ""));
  if (isNaN(n)) return null;
  // Negative = debit (expense), non-negative = credit (income/refund).
  return { amount: Math.abs(n).toFixed(2), direction: n < 0 ? "debit" : "credit" };
}

function resolveRow(raw: Record<string, string>, m: Mapping): MappedRow {
  const occurredOn = parseDate(raw[m.date] ?? "");
  const description = raw[m.description] ?? "";
  const catRaw = m.category ? (raw[m.category] ?? "") : "";
  const category = catRaw.trim() || null;

  if (m.splitMode) {
    const debitStr = (raw[m.debitColumn] ?? "").replace(/[$, ]/g, "");
    const creditStr = (raw[m.creditColumn] ?? "").replace(/[$, ]/g, "");
    const debitAmt = parseFloat(debitStr);
    const creditAmt = parseFloat(creditStr);
    if (!isNaN(debitAmt) && debitAmt > 0) {
      return { occurredOn, description, amount: debitAmt.toFixed(2), direction: "debit", category, hasError: false };
    }
    if (!isNaN(creditAmt) && creditAmt > 0) {
      return { occurredOn, description, amount: creditAmt.toFixed(2), direction: "credit", category, hasError: false };
    }
    return { occurredOn, description, amount: "0.00", direction: "debit", category, hasError: true };
  }

  const parsed = parseSigned(raw[m.amount] ?? "");
  if (!parsed) {
    return { occurredOn, description, amount: "0.00", direction: "debit", category, hasError: true };
  }

  let direction: "debit" | "credit" = parsed.direction;
  if (m.direction) {
    const dirVal = (raw[m.direction] ?? "").toLowerCase().trim();
    if (dirVal === "debit") direction = "debit";
    else if (dirVal === "credit") direction = "credit";
    // else fall through to sign-inferred direction
  }

  return { occurredOn, description, amount: parsed.amount, direction, category, hasError: false };
}

function detectPreset(headers: string[]) {
  const headerSet = new Set(headers);
  if (APPLE_CARD_PRESET.headers.every((h) => headerSet.has(h))) return APPLE_CARD_PRESET;
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColumnSelect({
  id,
  label,
  value,
  onChange,
  headers,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  headers: string[];
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {optional ? `${label} (optional)` : label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        aria-label={optional ? `${label} (optional)` : label}
      >
        <option value="">{COPY.csvWizard.unmapped}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CsvImportWizard({ accountId, accountCurrency, onDone, onCancel }: CsvImportWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [presetDetected, setPresetDetected] = useState(false);
  const [presetBannerVisible, setPresetBannerVisible] = useState(false);
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [slowUpload, setSlowUpload] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<ImportError | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading whenever the step changes (AC-11).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Escape: step 1 or post-success → cancel; steps 2-4 → go back one step (AC-11).
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (importResult || step === 1) {
        onCancel();
      } else {
        setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
      }
    },
    [step, importResult, onCancel],
  );
  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  // "Still uploading…" label after 2 s in-flight (AC-13).
  useEffect(() => {
    if (!importing) {
      setSlowUpload(false);
      return;
    }
    const t = setTimeout(() => setSlowUpload(true), 2000);
    return () => clearTimeout(t);
  }, [importing]);

  // ── Step 1: file selection ──────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsed(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const rows = result.data;
        const headers = result.meta.fields ?? [];
        if (headers.length === 0 || rows.length === 0) {
          setParseError(COPY.csvWizard.errorEmpty);
          return;
        }
        setParsed({ filename: file.name, headers, rows });
        // Auto-detect a preset and pre-fill the mapping (AC-5).
        const preset = detectPreset(headers);
        if (preset) {
          setPresetDetected(true);
          setPresetBannerVisible(true);
          setMapping({
            date: preset.mapping.date,
            description: preset.mapping.description,
            amount: preset.mapping.amount,
            direction: preset.mapping.direction,
            category: preset.mapping.category,
            splitMode: false,
            debitColumn: "",
            creditColumn: "",
          });
        } else {
          setPresetDetected(false);
          setPresetBannerVisible(false);
          setMapping(EMPTY_MAPPING);
        }
      },
      error() {
        setParseError(COPY.csvWizard.errorParse);
      },
    });
  }

  function canAdvanceStep1() {
    return parsed !== null && !parseError;
  }

  // ── Step 2: column mapping ──────────────────────────────────────────────────

  function setField(field: keyof Mapping) {
    return (v: string | boolean) =>
      setMapping((prev) => ({ ...prev, [field]: v }));
  }

  function canAdvanceStep2() {
    if (!mapping.date || !mapping.description) return false;
    if (mapping.splitMode) {
      return Boolean(mapping.debitColumn && mapping.creditColumn);
    }
    return Boolean(mapping.amount);
  }

  function advanceToStep3() {
    if (!parsed || !canAdvanceStep2()) return;
    setMappedRows(parsed.rows.map((r) => resolveRow(r, mapping)));
    setImportResult(null);
    setImportError(null);
    setStep(3);
  }

  // ── Step 4: import submission ───────────────────────────────────────────────

  async function doImport() {
    if (!parsed) return;

    // Row count guard (AC-9).
    if (parsed.rows.length > MAX_ROWS) {
      setImportError("row-limit");
      return;
    }

    setImporting(true);
    setImportError(null);

    const payload = mappedRows.map((r) => ({
      occurredOn: r.occurredOn,
      description: r.description,
      amount: r.amount,
      direction: r.direction,
      category: r.category,
    }));

    try {
      const res = await fetch(`/api/accounts/${accountId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      setImporting(false);
      if (res.status === 413) {
        setImportError("row-limit");
        return;
      }
      if (!res.ok) {
        setImportError("server");
        return;
      }
      const data = (await res.json()) as ImportResult;
      setImportResult(data);
    } catch {
      setImporting(false);
      setImportError("network");
    }
  }

  function errorCopy(e: ImportError): string {
    if (e === "row-limit") return COPY.csvWizard.errorRowLimit;
    if (e === "network") return COPY.csvWizard.errorNetwork;
    return COPY.csvWizard.errorServer;
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    1: COPY.csvWizard.step1Title,
    2: COPY.csvWizard.step2Title,
    3: COPY.csvWizard.step3Title,
    4: COPY.csvWizard.step4Title,
  };

  const previewRows = mappedRows.slice(0, 10);
  const totalRows = parsed?.rows.length ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Step progress indicator (AC-12) */}
      <div
        role="status"
        aria-label={COPY.csvWizardA11y.stepProgress.replace("{step}", String(step))}
        className="text-xs font-medium uppercase tracking-wide text-gray-400"
      >
        {COPY.csvWizard.stepIndicator.replace("{step}", String(step))}
      </div>

      {/* Step heading — receives focus on step change (AC-11) */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold text-gray-900 outline-none"
      >
        {stepTitles[step]}
      </h2>

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{COPY.csvWizard.rowCapNotice}</p>

          <div>
            <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700">
              {COPY.csvWizard.fileLabel}
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              aria-label={COPY.csvWizard.fileLabel}
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:cursor-pointer hover:file:bg-gray-800"
            />
          </div>

          {parseError && <Banner variant="error">{parseError}</Banner>}

          {parsed && !parseError && (
            <p className="text-sm text-gray-600">
              {COPY.csvWizard.rowCountInfo.replace("{count}", String(parsed.rows.length))}
            </p>
          )}

          <div className="flex gap-3">
            <Button onClick={canAdvanceStep1() ? () => setStep(2) : undefined} disabled={!canAdvanceStep1()}>
              {COPY.csvWizard.next}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              {COPY.csvWizard.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Column mapping ── */}
      {step === 2 && parsed && (
        <div className="space-y-4">
          {presetDetected && presetBannerVisible && (
            <div className="flex items-start justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <span>{COPY.csvWizard.presetBanner}</span>
              <button
                type="button"
                onClick={() => setPresetBannerVisible(false)}
                className="ml-3 flex-shrink-0 text-blue-600 underline hover:text-blue-800"
              >
                {COPY.csvWizard.presetBannerDismiss}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <ColumnSelect
              id="map-date"
              label={COPY.csvWizard.mapDate}
              value={mapping.date}
              onChange={setField("date")}
              headers={parsed.headers}
            />
            <ColumnSelect
              id="map-description"
              label={COPY.csvWizard.mapDescription}
              value={mapping.description}
              onChange={setField("description")}
              headers={parsed.headers}
            />

            {/* Split-mode toggle (AC-4) */}
            <div className="flex items-center gap-2">
              <input
                id="split-toggle"
                type="checkbox"
                checked={mapping.splitMode}
                onChange={(e) => setField("splitMode")(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                aria-label={COPY.csvWizard.splitToggleLabel}
              />
              <label htmlFor="split-toggle" className="text-sm text-gray-700">
                {COPY.csvWizard.splitToggleLabel}
              </label>
            </div>

            {mapping.splitMode ? (
              <>
                <ColumnSelect
                  id="map-debit"
                  label={COPY.csvWizard.mapDebit}
                  value={mapping.debitColumn}
                  onChange={setField("debitColumn")}
                  headers={parsed.headers}
                />
                <ColumnSelect
                  id="map-credit"
                  label={COPY.csvWizard.mapCredit}
                  value={mapping.creditColumn}
                  onChange={setField("creditColumn")}
                  headers={parsed.headers}
                />
              </>
            ) : (
              <>
                <ColumnSelect
                  id="map-amount"
                  label={COPY.csvWizard.mapAmount}
                  value={mapping.amount}
                  onChange={setField("amount")}
                  headers={parsed.headers}
                />
                <ColumnSelect
                  id="map-direction"
                  label={COPY.csvWizard.mapDirection}
                  value={mapping.direction}
                  onChange={setField("direction")}
                  headers={parsed.headers}
                  optional
                />
              </>
            )}

            <ColumnSelect
              id="map-category"
              label={COPY.csvWizard.mapCategory}
              value={mapping.category}
              onChange={setField("category")}
              headers={parsed.headers}
              optional
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={advanceToStep3} disabled={!canAdvanceStep2()}>
              {COPY.csvWizard.next}
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)}>
              {COPY.csvWizard.back}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">{COPY.csvWizard.colDate}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">{COPY.csvWizard.colDescription}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">{COPY.csvWizard.colAmount}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">{COPY.csvWizard.colDirection}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-900">{row.occurredOn}</td>
                    <td className="px-3 py-2 text-gray-900">{row.description}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{row.hasError ? "—" : row.amount}</td>
                    <td className="px-3 py-2">
                      {row.hasError ? (
                        <span
                          className="inline-flex items-center gap-1 text-amber-600"
                          aria-label={COPY.csvWizardA11y.directionError}
                        >
                          <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path
                              fillRule="evenodd"
                              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {COPY.csvWizard.warnBadDirection}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                            row.direction === "debit"
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {row.direction === "debit" ? COPY.csvWizardA11y.directionDebit : COPY.csvWizardA11y.directionCredit}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalRows > 10 && (
            <p className="text-sm text-gray-500">
              {COPY.csvWizard.previewMore.replace("{count}", String(totalRows))}
            </p>
          )}

          <div className="flex gap-3">
            <Button onClick={() => setStep(4)}>
              {COPY.csvWizard.next}
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)}>
              {COPY.csvWizard.back}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Confirm ── */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Success state */}
          {importResult && (
            <div className="space-y-4">
              <Banner variant="info">
                {importResult.inserted === 0 && importResult.superseded > 0
                  ? COPY.csvWizard.successAllDuplicate.replace("{total}", String(importResult.superseded))
                  : COPY.csvWizard.successSummary
                      .replace("{inserted}", String(importResult.inserted))
                      .replace("{superseded}", String(importResult.superseded))}
              </Banner>
              <Button onClick={onDone}>{COPY.csvWizard.doneCta}</Button>
            </div>
          )}

          {/* Import error */}
          {importError && !importResult && (
            <Banner variant="error">{errorCopy(importError)}</Banner>
          )}

          {/* Pre-import or retry state */}
          {!importResult && (
            <div className="space-y-3">
              {!importError && (
                <p className="text-sm text-gray-600">
                  {COPY.csvWizard.readyToImport
                    .replace("{count}", String(totalRows))
                    .replace("{currency}", accountCurrency)}
                </p>
              )}
              <div className="flex gap-3">
                <Button onClick={doImport} loading={importing} loadingLabel={slowUpload ? COPY.csvWizard.slowUpload : COPY.csvWizard.importing}>
                  {importing
                    ? COPY.csvWizard.importing
                    : importError
                    ? COPY.csvWizard.retry
                    : COPY.csvWizard.importCta.replace("{count}", String(totalRows))}
                </Button>
                {!importing && (
                  <Button variant="secondary" onClick={() => setStep(3)}>
                    {COPY.csvWizard.back}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

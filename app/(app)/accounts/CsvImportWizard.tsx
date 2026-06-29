"use client";

// WLT-27-4 — CsvImportWizard: 4-step CSV import flow for manual accounts.
// Step 1: Upload CSV (client-side parse via papaparse)
// Step 2: Column mapping (with Apple Card preset auto-detection)
// Step 3: Preview first 10 rows
// Step 4: Confirm + call POST /api/accounts/[id]/import
//
// Never sends a raw CSV file to the server — normalized JSON rows only.
// Imports papaparse only in this component (code-split at route level).

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { COPY } from "@/app/lib/copy";
import { type CsvPreset, detectPreset, getPreset } from "@wealth/aggregation/csv/apple-card";

const C = COPY.csvWizard;
const MAX_ROWS = 10_000;

interface ParsedRow {
  occurredOn: string;
  description: string;
  amount: string;
  direction: "debit" | "credit";
  directionError?: boolean;
  category?: string | null;
}

interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  category: string;
  splitDebitCredit: boolean;
  debitColumn: string;
  creditColumn: string;
}

function resolveDirection(
  rawRow: Record<string, string>,
  mapping: ColumnMapping,
  preset: CsvPreset | null,
): { amount: string; direction: "debit" | "credit"; error: boolean } {
  if (mapping.splitDebitCredit) {
    const debitVal = parseFloat(rawRow[mapping.debitColumn] ?? "");
    const creditVal = parseFloat(rawRow[mapping.creditColumn] ?? "");
    if (!isNaN(debitVal) && debitVal > 0) return { amount: String(debitVal), direction: "debit", error: false };
    if (!isNaN(creditVal) && creditVal > 0) return { amount: String(creditVal), direction: "credit", error: false };
    return { amount: "0", direction: "debit", error: true };
  }
  const rawAmt = rawRow[mapping.amount] ?? "";
  const parsed = parseFloat(rawAmt.replace(/[$,]/g, ""));
  if (isNaN(parsed)) return { amount: "0", direction: "debit", error: true };
  // Apple Card preset: negative = debit, positive = credit
  if (preset?.columnMap.directionFromSign) {
    return {
      amount: String(Math.abs(parsed)),
      direction: parsed < 0 ? "debit" : "credit",
      error: false,
    };
  }
  // Default: positive amounts are debits (most bank CSVs)
  return { amount: String(Math.abs(parsed)), direction: parsed >= 0 ? "debit" : "credit", error: false };
}

function mapRows(rawData: Record<string, string>[], mapping: ColumnMapping, preset: CsvPreset | null): ParsedRow[] {
  return rawData.map((raw) => {
    const { amount, direction, error } = resolveDirection(raw, mapping, preset);
    const occurredOn = raw[mapping.date] ?? "";
    return {
      occurredOn,
      description: raw[mapping.description] ?? "",
      amount,
      direction,
      directionError: error,
      category: mapping.category ? (raw[mapping.category] ?? null) : null,
    };
  });
}

type WizardStep = 1 | 2 | 3 | 4;

export function CsvImportWizard({
  accountId,
  accountCurrency,
  onClose,
}: {
  accountId: string;
  accountCurrency: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [detectedPresetId, setDetectedPresetId] = useState<string | null>(null);
  const [presetBannerVisible, setPresetBannerVisible] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: "",
    description: "",
    amount: "",
    category: "",
    splitDebitCredit: false,
    debitColumn: "",
    creditColumn: "",
  });
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; superseded: number; removed: number } | null>(null);
  const [slowUpload, setSlowUpload] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Manage focus on step transitions.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [step]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setParseError(null);
    setRawData([]);
    setHeaders([]);
    setDetectedPresetId(null);
    setPresetBannerVisible(false);

    Papa.parse<Record<string, string>>(selected, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError(C.parseError);
          return;
        }
        if (results.data.length === 0) {
          setParseError(C.emptyFile);
          return;
        }
        const cols = results.meta.fields ?? [];
        setHeaders(cols);
        setRawData(results.data);
      },
      error: () => {
        setParseError(C.parseError);
      },
    });
  }

  function advanceToStep2() {
    if (parseError || rawData.length === 0) return;
    const presetId = detectPreset(headers);
    const preset = presetId ? getPreset(presetId) : null;
    const newMapping: ColumnMapping = { date: "", description: "", amount: "", category: "", splitDebitCredit: false, debitColumn: "", creditColumn: "" };
    if (preset) {
      newMapping.date = preset.columnMap.date;
      newMapping.description = preset.columnMap.description;
      newMapping.amount = preset.columnMap.amount;
      newMapping.category = preset.columnMap.category ?? "";
      setDetectedPresetId(presetId);
      setPresetBannerVisible(true);
    } else {
      setDetectedPresetId(null);
      setPresetBannerVisible(false);
    }
    setMapping(newMapping);
    setStep(2);
  }

  function canAdvanceToStep3(): boolean {
    if (mapping.splitDebitCredit) {
      return !!(mapping.date && mapping.description && mapping.debitColumn && mapping.creditColumn);
    }
    return !!(mapping.date && mapping.description && mapping.amount);
  }

  function advanceToStep3() {
    if (!canAdvanceToStep3()) return;
    const preset = detectedPresetId ? getPreset(detectedPresetId) : null;
    const mapped = mapRows(rawData, mapping, preset);
    setPreview(mapped.slice(0, 10));
    setStep(3);
  }

  async function handleImport() {
    const preset = detectedPresetId ? getPreset(detectedPresetId) : null;
    const allRows = mapRows(rawData, mapping, preset);

    setImporting(true);
    setImportError(null);
    slowTimer.current = setTimeout(() => setSlowUpload(true), 2000);

    try {
      const res = await fetch(`/api/accounts/${accountId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: allRows.map(({ occurredOn, description, amount, direction, category }) => ({
            occurredOn,
            description,
            amount,
            direction,
            category: category ?? null,
          })),
        }),
      });
      const json = (await res.json()) as { error?: string; inserted?: number; superseded?: number; removed?: number };

      if (!res.ok) {
        if (json.error === "ROW_LIMIT_EXCEEDED") {
          setImportError(C.errorRowLimit);
        } else {
          setImportError(C.errorServer);
        }
        return;
      }
      setImportResult({ inserted: json.inserted ?? 0, superseded: json.superseded ?? 0, removed: json.removed ?? 0 });
      setStep(4);
    } catch {
      setImportError(C.errorNetwork);
    } finally {
      setImporting(false);
      setSlowUpload(false);
      if (slowTimer.current) clearTimeout(slowTimer.current);
    }
  }

  const stepLabel = C.stepIndicator.replace("{N}", String(step));
  const totalRows = rawData.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-wizard-title"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="csv-wizard-title" className="text-lg font-semibold text-gray-900">
            {C.title}
          </h2>
          <span role="status" className="text-sm text-gray-500">
            {stepLabel}
          </span>
        </div>

        {/* ── Step 1: Upload ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="mt-4 space-y-4">
            <h3 className="font-medium text-gray-800">{C.step1Heading}</h3>
            <p className="text-sm text-gray-500">{C.rowCapNotice}</p>
            <div>
              <label htmlFor="csv-file-input" className="block text-sm font-medium text-gray-700">
                CSV file
              </label>
              <input
                ref={firstFieldRef}
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-gray-600"
                aria-label="Upload a CSV file"
              />
            </div>
            {parseError ? (
              <p role="alert" className="text-sm text-red-600">
                {parseError}
              </p>
            ) : file && rawData.length > 0 ? (
              <p className="text-sm text-gray-600">
                {rawData.length.toLocaleString()} rows found · {headers.length} columns detected
              </p>
            ) : null}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={advanceToStep2}
                disabled={!file || rawData.length === 0 || !!parseError}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {C.nextCta}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
              >
                {C.cancelCta}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Column mapping ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="mt-4 space-y-4">
            <h3 className="font-medium text-gray-800">{C.step2Heading}</h3>

            {presetBannerVisible ? (
              <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <span>{C.presetDetectedBanner}</span>
                <button type="button" onClick={() => setPresetBannerVisible(false)} className="ml-4 text-xs underline">
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="space-y-3">
              {(["date", "description", "amount"] as const).map((field) => (
                <div key={field}>
                  <label htmlFor={`map-${field}`} className="block text-sm font-medium text-gray-700 capitalize">
                    {field} <span className="text-red-500">*</span>
                  </label>
                  <select
                    id={`map-${field}`}
                    value={mapping[field]}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    aria-label={`Map ${field} column`}
                  >
                    <option value="">{C.notMappedOption}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label htmlFor="map-category" className="block text-sm font-medium text-gray-700">
                  Category <span className="text-gray-400">(optional)</span>
                </label>
                <select
                  id="map-category"
                  value={mapping.category}
                  onChange={(e) => setMapping((m) => ({ ...m, category: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Map category column"
                >
                  <option value="">{C.notMappedOption}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={mapping.splitDebitCredit}
                  onChange={(e) => setMapping((m) => ({ ...m, splitDebitCredit: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  aria-label={C.splitColumnsToggle}
                />
                {C.splitColumnsToggle}
              </label>
              {mapping.splitDebitCredit ? (
                <div className="grid grid-cols-2 gap-3">
                  {(["debitColumn", "creditColumn"] as const).map((field) => (
                    <div key={field}>
                      <label htmlFor={`map-${field}`} className="block text-sm font-medium text-gray-700">
                        {field === "debitColumn" ? "Debit column" : "Credit column"} <span className="text-red-500">*</span>
                      </label>
                      <select
                        id={`map-${field}`}
                        value={mapping[field]}
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        aria-label={field === "debitColumn" ? "Debit amount column" : "Credit amount column"}
                      >
                        <option value="">{C.notMappedOption}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={advanceToStep3}
                disabled={!canAdvanceToStep3()}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {C.nextCta}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                {C.backCta}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ─────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="mt-4 space-y-4">
            <h3 className="font-medium text-gray-800">{C.step3Heading}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr>
                    {["Date", "Description", "Amount", "Direction"].map((col) => (
                      <th key={col} className="bg-gray-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i} className={row.directionError ? "bg-yellow-50" : ""}>
                      <td className="px-3 py-2 text-gray-700">{row.occurredOn}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-gray-700">{row.description}</td>
                      <td className="px-3 py-2 text-gray-700">{row.amount}</td>
                      <td className="px-3 py-2">
                        {row.directionError ? (
                          <span className="text-amber-600">{C.previewDirectionWarning}</span>
                        ) : (
                          <span className={row.direction === "debit" ? "text-red-600" : "text-green-600"}>{row.direction}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalRows > 10 ? <p className="text-xs text-gray-500">Showing 10 of {totalRows.toLocaleString()} rows</p> : null}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {C.nextCta}
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                {C.backCta}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm + result ──────────────────────────────────────── */}
        {step === 4 && !importResult && (
          <div className="mt-4 space-y-4">
            <h3 className="font-medium text-gray-800">{C.step4Heading}</h3>
            <p className="text-sm text-gray-600">
              Ready to import {totalRows.toLocaleString()} transactions into this account ({accountCurrency}).
            </p>
            {importError ? (
              <p role="alert" className="text-sm text-red-600">
                {importError}
              </p>
            ) : null}
            {slowUpload ? (
              <p role="status" aria-live="polite" className="text-sm text-gray-500">
                {C.slowUpload}
              </p>
            ) : null}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? C.importingLabel : C.importCta.replace("{N}", String(totalRows))}
              </button>
              {!importing ? (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  {C.backCta}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Step 4 success state ──────────────────────────────────────────── */}
        {step === 4 && importResult && (
          <div className="mt-4 space-y-4">
            <div role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {importResult.inserted === 0 && importResult.superseded > 0
                ? C.successAllSeen.replace("{N}", String(importResult.superseded))
                : C.success
                    .replace("{N}", String(importResult.inserted))
                    .replace("{M}", String(importResult.superseded))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2"
            >
              {C.doneCta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

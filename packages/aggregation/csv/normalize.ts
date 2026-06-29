import type { CsvPreset } from "./apple-card";

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  category: string;
  splitDebitCredit: boolean;
  debitColumn: string;
  creditColumn: string;
}

/**
 * Resolves the amount and direction for a single raw CSV row.
 *
 * Split debit/credit mode: only a positive value in one column is valid.
 * Rows where both columns are blank, zero, or non-numeric return error: true
 * with amount "0". Callers MUST filter error rows before sending to the server.
 */
export function resolveDirection(
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
  if (preset?.columnMap.directionFromSign) {
    return {
      amount: String(Math.abs(parsed)),
      direction: parsed < 0 ? "debit" : "credit",
      error: false,
    };
  }
  return { amount: String(Math.abs(parsed)), direction: parsed >= 0 ? "debit" : "credit", error: false };
}

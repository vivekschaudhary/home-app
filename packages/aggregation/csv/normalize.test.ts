// regression: true  e2e: false
// Regression: BLOCKER from PR #124 review — split debit/credit mode produced
// zero-amount rows for common CSV formats where the inactive column is "0.00"
// or blank.

import { describe, expect, it } from "vitest";
import type { ColumnMapping } from "./normalize";
import { resolveDirection } from "./normalize";

const BASE_MAPPING: ColumnMapping = {
  date: "Date",
  description: "Description",
  amount: "",
  category: "",
  splitDebitCredit: true,
  debitColumn: "Debit",
  creditColumn: "Credit",
};

describe("resolveDirection — split debit/credit mode", () => {
  it("returns debit when debit column has a positive value, credit is blank", () => {
    const result = resolveDirection(
      { Date: "2024-01-01", Description: "Purchase", Debit: "25.00", Credit: "" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "25", direction: "debit", error: false });
  });

  it("returns credit when credit column has a positive value, debit is blank", () => {
    const result = resolveDirection(
      { Date: "2024-01-02", Description: "Refund", Debit: "", Credit: "10.00" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "10", direction: "credit", error: false });
  });

  it("returns debit when debit has a value, credit column is '0.00'", () => {
    // Common bank CSV format: inactive column shows "0.00", not blank.
    const result = resolveDirection(
      { Date: "2024-01-01", Description: "Purchase", Debit: "25.00", Credit: "0.00" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "25", direction: "debit", error: false });
  });

  it("returns credit when credit has a value, debit column is '0.00'", () => {
    const result = resolveDirection(
      { Date: "2024-01-02", Description: "Deposit", Debit: "0.00", Credit: "100.00" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "100", direction: "credit", error: false });
  });

  it("returns error: true when both columns are '0.00' (e.g., opening balance row)", () => {
    // These rows must NOT be sent to the server — callers must filter error rows.
    const result = resolveDirection(
      { Date: "2024-01-01", Description: "Opening Balance", Debit: "0.00", Credit: "0.00" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "0", direction: "debit", error: true });
  });

  it("returns error: true when both columns are blank", () => {
    const result = resolveDirection(
      { Date: "2024-01-01", Description: "Blank Row", Debit: "", Credit: "" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "0", direction: "debit", error: true });
  });

  it("returns error: true when both columns are non-numeric", () => {
    const result = resolveDirection(
      { Date: "2024-01-01", Description: "Bad Row", Debit: "N/A", Credit: "N/A" },
      BASE_MAPPING,
      null,
    );
    expect(result).toEqual({ amount: "0", direction: "debit", error: true });
  });
});

describe("resolveDirection — single signed-amount column", () => {
  const SINGLE_MAPPING: ColumnMapping = {
    ...BASE_MAPPING,
    splitDebitCredit: false,
    amount: "Amount",
  };

  it("returns debit for a positive amount (default: positive = debit)", () => {
    const result = resolveDirection({ Amount: "25.00" }, SINGLE_MAPPING, null);
    expect(result).toEqual({ amount: "25", direction: "debit", error: false });
  });

  it("returns error for a non-numeric amount", () => {
    const result = resolveDirection({ Amount: "N/A" }, SINGLE_MAPPING, null);
    expect(result).toEqual({ amount: "0", direction: "debit", error: true });
  });

  it("applies directionFromSign preset: negative = debit, positive = credit", () => {
    const preset = {
      id: "test",
      name: "Test",
      headerSignature: [],
      columnMap: { date: "Date", description: "Desc", amount: "Amount", directionFromSign: true as const },
    };
    expect(resolveDirection({ Amount: "-25.00" }, SINGLE_MAPPING, preset)).toEqual({
      amount: "25",
      direction: "debit",
      error: false,
    });
    expect(resolveDirection({ Amount: "10.00" }, SINGLE_MAPPING, preset)).toEqual({
      amount: "10",
      direction: "credit",
      error: false,
    });
  });
});

// Apple Card CSV import preset.
// TODO: validate these headers against a real iOS export before finalizing (WLT-27-6).
// Based on Apple support docs HT211489 — treat as placeholder until WLT-27-6 confirms.

export interface CsvPreset {
  name: string;
  /** Exact column headers expected in the CSV (for auto-detection). */
  headers: readonly string[];
  mapping: {
    date: string;
    description: string;
    amount: string;
    /** Column containing "debit"/"credit" direction text. Empty string = infer from amount sign. */
    direction: string;
    category: string;
  };
  /** True when the amount column is signed: negative = debit (purchase), positive = credit (refund). */
  amountSigned: boolean;
}

export const APPLE_CARD_PRESET: CsvPreset = {
  name: "Apple Card",
  headers: [
    "Transaction Date",
    "Clearing Date",
    "Description",
    "Merchant",
    "Category",
    "Type",
    "Amount (USD)",
  ],
  mapping: {
    date: "Transaction Date",
    description: "Merchant",
    amount: "Amount (USD)",
    direction: "", // infer from sign: negative amount = debit (purchase)
    category: "Category",
  },
  amountSigned: true,
};

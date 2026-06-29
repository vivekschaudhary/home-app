// WLT-27-4 placeholder; finalized in WLT-27-6 against a real iOS export.
//
// Apple Card CSV format per Apple support doc HT211489.
// TODO (WLT-27-6): validate headers against a real iOS export and replace this
// placeholder with confirmed headers. If the headers differ from the docs, update
// headerSignature and columnMap accordingly and add a "Validated against iOS
// export YYYY-MM-DD" comment.
//
// Sign convention (from HT211489): Amount (USD) is NEGATIVE for purchases/debits
// and POSITIVE for refunds/credits. The wizard's direction resolution must apply:
//   amount < 0 → direction = 'debit', amount = Math.abs(amount)
//   amount >= 0 → direction = 'credit', amount = amount
//
// UNVALIDATED — do not ship with MULTI_CURRENCY_ACCOUNTS_ENABLED until WLT-27-6
// confirms against a real export.

export interface CsvPreset {
  id: string;
  name: string;
  /** Exact column headers in the order they appear in the CSV. Used for auto-detection. */
  headerSignature: string[];
  columnMap: {
    date: string;
    description: string;
    amount: string;
    /** When the CSV uses a single signed-amount column, 'direction' is derived from the sign. */
    directionFromSign?: boolean;
    category?: string;
  };
}

// UNVALIDATED — placeholder headers from Apple support doc HT211489.
// WLT-27-6 must confirm against a real iOS export before enabling MULTI_CURRENCY.
export const APPLE_CARD_PRESET: CsvPreset = {
  id: "apple-card",
  name: "Apple Card",
  headerSignature: ["Transaction Date", "Clearing Date", "Description", "Merchant", "Category", "Type", "Amount (USD)"],
  columnMap: {
    date: "Transaction Date",
    description: "Description",
    amount: "Amount (USD)",
    directionFromSign: true, // negative = debit, positive = credit
    category: "Category",
  },
};

export const CSV_PRESETS: CsvPreset[] = [APPLE_CARD_PRESET];

/**
 * Returns the matching preset id if the given headers exactly match a preset's
 * headerSignature, or null if no preset matches.
 */
export function detectPreset(headers: string[]): string | null {
  for (const preset of CSV_PRESETS) {
    if (preset.headerSignature.length !== headers.length) continue;
    if (preset.headerSignature.every((h, i) => h === headers[i])) return preset.id;
  }
  return null;
}

/** Find a preset by id. */
export function getPreset(id: string): CsvPreset | null {
  return CSV_PRESETS.find((p) => p.id === id) ?? null;
}

// WLT-27-6 — Apple Card preset unit tests.
// regression: false  e2e: false
//
// Tests the detectPreset() function and the APPLE_CARD_PRESET descriptor.
// NOTE: headers are based on Apple support doc HT211489 (UNVALIDATED —
// WLT-27-6 AC-1 requires confirmation against a real iOS export).

import { describe, expect, it } from "vitest";
import { APPLE_CARD_PRESET, detectPreset, getPreset } from "./apple-card";

const APPLE_CARD_HEADERS = [
  "Transaction Date",
  "Clearing Date",
  "Description",
  "Merchant",
  "Category",
  "Type",
  "Amount (USD)",
];

describe("detectPreset", () => {
  it("returns 'apple-card' when headers exactly match the Apple Card signature", () => {
    expect(detectPreset(APPLE_CARD_HEADERS)).toBe("apple-card");
  });

  it("returns null for unknown headers", () => {
    expect(detectPreset(["Date", "Description", "Amount"])).toBeNull();
    expect(detectPreset([])).toBeNull();
  });

  it("returns null when headers partially match (wrong length)", () => {
    expect(detectPreset(APPLE_CARD_HEADERS.slice(0, -1))).toBeNull();
  });

  it("returns null when headers are in the right set but wrong order", () => {
    const scrambled = [...APPLE_CARD_HEADERS].reverse();
    expect(detectPreset(scrambled)).toBeNull();
  });
});

describe("getPreset", () => {
  it("returns the APPLE_CARD_PRESET descriptor for id 'apple-card'", () => {
    const preset = getPreset("apple-card");
    expect(preset).not.toBeNull();
    expect(preset?.id).toBe("apple-card");
    expect(preset?.columnMap.date).toBe("Transaction Date");
    expect(preset?.columnMap.amount).toBe("Amount (USD)");
    expect(preset?.columnMap.directionFromSign).toBe(true);
  });

  it("returns null for an unknown preset id", () => {
    expect(getPreset("unknown-bank")).toBeNull();
  });
});

describe("APPLE_CARD_PRESET descriptor", () => {
  it("has the expected headerSignature", () => {
    expect(APPLE_CARD_PRESET.headerSignature).toEqual(APPLE_CARD_HEADERS);
  });

  it("uses directionFromSign: true (negative = debit, positive = credit)", () => {
    expect(APPLE_CARD_PRESET.columnMap.directionFromSign).toBe(true);
  });

  it("maps category from 'Category' column", () => {
    expect(APPLE_CARD_PRESET.columnMap.category).toBe("Category");
  });
});

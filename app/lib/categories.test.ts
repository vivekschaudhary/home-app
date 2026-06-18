import { describe, expect, it } from "vitest";
import { categoriesToSeed } from "./categories";

// WLT-22-2 — the cold-start seeding logic (pure): the user's DISTINCT provider
// categories become their own `categories` rows, kind from the essential set.
describe("categoriesToSeed", () => {
  it("seeds the distinct provider categories present in the user's data", () => {
    const rows = categoriesToSeed(["FOOD_AND_DRINK", "FOOD_AND_DRINK", "TRAVEL", null], []);
    expect(rows.map((r) => r.name).sort()).toEqual(["FOOD_AND_DRINK", "TRAVEL"]);
    expect(rows.every((r) => r.source === "seed")).toBe(true);
  });

  it("classifies kind from the built-in essential allow-list", () => {
    const rows = categoriesToSeed(["FOOD_AND_DRINK", "TRAVEL"], []);
    expect(rows.find((r) => r.name === "FOOD_AND_DRINK")?.kind).toBe("essential");
    expect(rows.find((r) => r.name === "TRAVEL")?.kind).toBe("discretionary");
  });

  it("is idempotent — skips categories the user already has (case-insensitive)", () => {
    const rows = categoriesToSeed(["FOOD_AND_DRINK", "TRAVEL"], ["food_and_drink"]);
    expect(rows.map((r) => r.name)).toEqual(["TRAVEL"]);
  });

  it("drops null categories (the 'Other' bucket isn't a seeded category)", () => {
    expect(categoriesToSeed([null, null], [])).toEqual([]);
  });
});

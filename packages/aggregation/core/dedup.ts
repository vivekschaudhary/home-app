// Pure idempotency helpers (the most unit-testable surface). The `(user_id,
// dedup_key, content_hash)` unique constraint makes ingest idempotent AND
// CDC-correct: same content re-emitted ⇒ no-op; a `modified` revision ⇒ new row.

import { createHash } from "node:crypto";
import type { NormalizedTransaction } from "./types";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable logical identity of a transaction across content revisions. */
export function dedupKey(t: Pick<NormalizedTransaction, "source" | "providerAccountId" | "providerTransactionId" | "occurredOn" | "amount" | "description">): string {
  if (t.providerTransactionId) {
    return `${t.source}:${t.providerAccountId}:${t.providerTransactionId}`;
  }
  // No provider id (CSV/manual) — synthesize from stable content.
  return `${t.source}:${t.providerAccountId}:${sha256(`${t.occurredOn}|${t.amount}|${t.description}`)}`;
}

/** Hash of the MUTABLE fields — distinguishes a real `modified` revision from a replay. */
export function contentHash(t: Pick<NormalizedTransaction, "amount" | "direction" | "description" | "merchant" | "category" | "pending">): string {
  return sha256([t.amount, t.direction, t.description, t.merchant ?? "", t.category ?? "", t.pending ? "1" : "0"].join("|"));
}

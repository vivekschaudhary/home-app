// The single convergence point — Plaid sync and (future) CSV both land here.
// Idempotent: `unique(user_id, dedup_key, content_hash)` + ignoreDuplicates makes
// a replay a no-op; a `modified` revision is a new row that supersedes the prior;
// `removed` is a tombstone. Writes run under the service role (financial-table
// posture). The caller persists the provider cursor only AFTER this resolves, so a
// mid-sync failure re-ingests (dedup-safe) rather than dropping rows.

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { contentHash, dedupKey } from "./dedup";
import type { FetchTransactionsPage } from "./provider";
import type { NormalizedTransaction } from "./types";

type Svc = ReturnType<typeof createServiceSupabase>;

export interface IngestResult {
  inserted: number;
  superseded: number;
  removed: number;
}

function rowFor(userId: string, accountId: string, t: NormalizedTransaction) {
  return {
    user_id: userId,
    account_id: accountId,
    source: t.source,
    provider_transaction_id: t.providerTransactionId,
    dedup_key: dedupKey(t),
    content_hash: contentHash(t),
    amount: t.amount,
    direction: t.direction,
    currency: t.currency,
    description: t.description,
    merchant: t.merchant,
    merchant_entity_id: t.merchantEntityId ?? null, // WLT-22-4 — Plaid's stable merchant id
    category: t.category,
    kind: t.kind, // WLT-22-5 (AC8) — normalized transfer/payment classification
    occurred_on: t.occurredOn,
    pending: t.pending,
  };
}

export async function ingestTransactions(input: {
  userId: string;
  page: FetchTransactionsPage;
  /** providerAccountId → our financial_accounts.id (resolved by the caller). */
  accountIdByProviderAccountId: Map<string, string>;
  svc?: Svc;
}): Promise<IngestResult> {
  const svc = input.svc ?? createServiceSupabase();
  const { userId, page, accountIdByProviderAccountId: accMap } = input;

  // added + modified → insert the (revision) row; idempotent on the unique key.
  const rows = [...page.added, ...page.modified]
    .map((t) => {
      const acc = accMap.get(t.providerAccountId);
      return acc ? rowFor(userId, acc, t) : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await svc
      .from("transactions")
      .upsert(rows, { onConflict: "user_id,dedup_key,content_hash", ignoreDuplicates: true })
      .select("id, dedup_key, content_hash");
    if (error) throw new Error(`[ingest] insert failed: ${error.message}`);
    inserted = data?.length ?? 0;
  }

  // modified → point prior revisions of the same dedup_key at the new row.
  let superseded = 0;
  for (const t of page.modified) {
    const dk = dedupKey(t);
    const ch = contentHash(t);
    const { data: cur } = await svc
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("dedup_key", dk)
      .eq("content_hash", ch)
      .limit(1)
      .maybeSingle();
    const newId = (cur as { id: string } | null)?.id;
    if (!newId) continue;
    const { error } = await svc
      .from("transactions")
      .update({ superseded_by: newId })
      .eq("user_id", userId)
      .eq("dedup_key", dk)
      .neq("content_hash", ch)
      .is("superseded_by", null);
    if (!error) superseded++;
  }

  // removed → tombstone (preserves the audit trail).
  let removed = 0;
  for (const provTxnId of page.removed) {
    const { error } = await svc
      .from("transactions")
      .update({ removed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider_transaction_id", provTxnId)
      .is("removed_at", null);
    if (!error) removed++;
  }

  return { inserted, superseded, removed };
}

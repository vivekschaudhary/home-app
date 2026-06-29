// WLT-27-3 — POST /api/accounts/[id]/import: ingest CSV-normalized rows into
// a manual financial account. AAL2-gated, service-role write (via ingestTransactions).
// Only accepts accounts where connection_id IS NULL (manual accounts only).
// Never receives a raw CSV file — the wizard (WLT-27-4) does client-side parsing
// and sends only normalized JSON rows, keeping the serverless footprint small.

import { createServiceSupabase, getAal2UserId } from "@vc1023/passkey-2fa";
import { ingestTransactions } from "@wealth/aggregation";
import type { NormalizedTransaction } from "@wealth/aggregation";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

interface NormalizedCsvRow {
  occurredOn: string;
  description: string;
  amount: string;
  direction: "debit" | "credit";
  category?: string | null;
}

function isValidCsvRow(r: unknown): r is NormalizedCsvRow {
  if (!r || typeof r !== "object") return false;
  const row = r as Record<string, unknown>;
  return (
    typeof row.occurredOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn) &&
    typeof row.description === "string" &&
    row.description.length > 0 &&
    typeof row.amount === "string" &&
    /^\d+(\.\d+)?$/.test(row.amount) &&
    parseFloat(row.amount) > 0 &&
    (row.direction === "debit" || row.direction === "credit")
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: accountId } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(accountId)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Verify account ownership and manual status via service-role (owner RLS applies
  // via the policy, but we use service-role here to avoid double-hop overhead).
  const svc = createServiceSupabase();
  const { data: account, error: acctError } = await svc
    .from("financial_accounts")
    .select("id, user_id, connection_id, currency")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (acctError || !account) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const acct = account as { id: string; user_id: string; connection_id: string | null; currency: string };
  if (acct.user_id !== userId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (acct.connection_id !== null) {
    return Response.json({ error: "ACCOUNT_NOT_MANUAL" }, { status: 400 });
  }

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.rows)) {
    return Response.json({ error: "bad_request", message: "rows must be an array" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return Response.json({ error: "ROW_LIMIT_EXCEEDED", limit: MAX_ROWS }, { status: 400 });
  }

  const invalidRows = body.rows.filter((r) => !isValidCsvRow(r));
  if (invalidRows.length > 0) {
    return Response.json(
      { error: "validation", message: "One or more rows have missing or invalid fields (occurredOn, description, amount, direction)." },
      { status: 400 },
    );
  }

  const csvRows = body.rows as NormalizedCsvRow[];
  const normalized: NormalizedTransaction[] = csvRows.map((row) => ({
    providerTransactionId: null,
    // WLT-27-3 BLOCKER fix: use the actual account UUID so dedup keys are scoped
    // per account (csv:<accountId>:<hash>). null → 'manual' collapses ALL manual
    // accounts onto the same key segment, causing cross-account dedup collisions.
    providerAccountId: accountId,
    source: "csv",
    amount: row.amount,
    direction: row.direction,
    currency: acct.currency,
    description: row.description,
    merchant: null,
    merchantEntityId: null,
    category: row.category ?? null,
    kind: "spend" as const,
    occurredOn: row.occurredOn,
    pending: false,
  }));

  try {
    const result = await ingestTransactions({
      userId,
      page: { added: normalized, modified: [], removed: [], nextCursor: null, hasMore: false },
      accountIdByProviderAccountId: new Map([[accountId, accountId]]),
      svc,
    });
    return Response.json(result);
  } catch (e) {
    console.error("[POST /api/accounts/[id]/import] ingest failed:", e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

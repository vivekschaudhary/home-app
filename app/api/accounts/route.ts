// WLT-27-2 — POST /api/accounts: create a manual financial account.
// AAL2-gated, service-role write (financial-table write posture).
// Gated behind MANUAL_ACCOUNTS_ENABLED env flag.
// Non-USD accounts additionally gated behind MULTI_CURRENCY_ACCOUNTS_ENABLED.

import { createServiceSupabase, getAal2UserId } from "@vc1023/passkey-2fa";

export const runtime = "nodejs";

// ISO 4217 allowlist for the MVP — USD always allowed; non-USD gated behind
// MULTI_CURRENCY_ACCOUNTS_ENABLED. Kept small by design; expand as needed.
const ALLOWED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "MXN",
  "BRL", "KRW", "SGD", "HKD", "NOK", "SEK", "DKK", "NZD", "ZAR", "AED",
]);

type UserKind = "checking" | "savings" | "credit" | "investment" | "other";
type DbKind = "depository" | "credit" | "investment" | "other";

function mapKind(kind: UserKind): DbKind {
  if (kind === "checking" || kind === "savings") return "depository";
  return kind; // credit | investment | other pass through
}

const VALID_KINDS = new Set<UserKind>(["checking", "savings", "credit", "investment", "other"]);

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const MANUAL_ACCOUNTS_ENABLED = process.env.MANUAL_ACCOUNTS_ENABLED === "true";
  if (!MANUAL_ACCOUNTS_ENABLED) {
    return Response.json({ error: "MANUAL_ACCOUNTS_DISABLED" }, { status: 403 });
  }

  let body: { name?: unknown; institutionName?: unknown; kind?: unknown; currency?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "validation", field: "name", message: "Account name is required." }, { status: 400 });
  }
  if (!VALID_KINDS.has(body.kind as UserKind)) {
    return Response.json({ error: "validation", field: "kind", message: "Unrecognized account type." }, { status: 400 });
  }

  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : "USD";
  const MULTI_CURRENCY_ENABLED = process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED === "true";
  if (currency !== "USD" && !MULTI_CURRENCY_ENABLED) {
    return Response.json({ error: "MULTI_CURRENCY_DISABLED", message: "Only USD accounts are supported right now." }, { status: 400 });
  }
  if (!ALLOWED_CURRENCIES.has(currency)) {
    return Response.json({ error: "validation", field: "currency", message: "Unrecognized currency code." }, { status: 400 });
  }

  const name = (body.name as string).trim();
  const institutionName = typeof body.institutionName === "string" ? body.institutionName.trim() || null : null;
  const dbKind = mapKind(body.kind as UserKind);

  const svc = createServiceSupabase();
  const { data, error } = await svc
    .from("financial_accounts")
    .insert({
      user_id: userId,
      connection_id: null,
      provider_account_id: null,
      name,
      institution_name: institutionName,
      kind: dbKind,
      currency,
    })
    .select("id, name, kind, currency")
    .single();

  if (error) {
    console.error("[POST /api/accounts] insert failed:", error.message);
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const row = data as { id: string; name: string; kind: string; currency: string };
  return Response.json({ account: { id: row.id, name: row.name, kind: row.kind, currency: row.currency } });
}

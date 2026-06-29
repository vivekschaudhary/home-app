// WLT-27-3 — Integration tests for POST /api/accounts/[id]/import.
// Covers: AC-4 (401 unauth), AC-5 (404 no account / cross-user), AC-6 (400 ACCOUNT_NOT_MANUAL),
//         AC-7 (400 ROW_LIMIT_EXCEEDED), AC-8 (row mapping), AC-10 (result shape),
//         malformed row / missing-field validation.
// regression: false  e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

const { mockGetAal2UserId, mockMaybySingle, mockIngestTransactions } = vi.hoisted(() => ({
  mockGetAal2UserId: vi.fn(),
  mockMaybySingle: vi.fn(),
  mockIngestTransactions: vi.fn(),
}));

vi.mock("@vc1023/passkey-2fa", () => ({
  getAal2UserId: mockGetAal2UserId,
  createServiceSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybySingle: mockMaybySingle,
            maybeSingle: mockMaybySingle,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@wealth/aggregation", () => ({
  ingestTransactions: mockIngestTransactions,
}));

// Build a minimal valid row.
function row(overrides: Partial<{
  occurredOn: string;
  description: string;
  amount: string;
  direction: "debit" | "credit";
  category: string | null;
}> = {}) {
  return { occurredOn: "2026-06-01", description: "Coffee", amount: "4.50", direction: "debit" as const, ...overrides };
}

function makeReq(
  body: object,
  accountId = VALID_UUID,
): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/accounts/${accountId}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id: accountId }) }];
}

// Default manual account returned by the mock DB lookup.
const MANUAL_ACCOUNT = { id: VALID_UUID, user_id: "user-1", connection_id: null, currency: "USD" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated user-1, manual account exists.
  mockGetAal2UserId.mockResolvedValue("user-1");
  mockMaybySingle.mockResolvedValue({ data: MANUAL_ACCOUNT, error: null });
  mockIngestTransactions.mockResolvedValue({ inserted: 1, superseded: 0, removed: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── AC-4: 401 when unauthenticated ────────────────────────────────────────────
describe("AC-4: AAL2 gate", () => {
  it("returns 401 when getAal2UserId returns null", async () => {
    mockGetAal2UserId.mockResolvedValue(null);
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });
});

// ── AC-5: 404 for non-existent or cross-user account ─────────────────────────
describe("AC-5: account ownership check", () => {
  it("returns 404 when account is not found in DB", async () => {
    mockMaybySingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when account belongs to another user", async () => {
    mockMaybySingle.mockResolvedValue({
      data: { ...MANUAL_ACCOUNT, user_id: "other-user" },
      error: null,
    });
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(404);
  });

  it("returns 404 on DB error", async () => {
    mockMaybySingle.mockResolvedValue({ data: null, error: { message: "db error" } });
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(404);
  });

  it("returns 404 for an invalid (non-UUID) accountId", async () => {
    const res = await POST(...makeReq({ rows: [row()] }, "not-a-uuid"));
    expect(res.status).toBe(404);
  });
});

// ── AC-6: 400 ACCOUNT_NOT_MANUAL ──────────────────────────────────────────────
describe("AC-6: manual account guard", () => {
  it("returns 400 ACCOUNT_NOT_MANUAL when account has a non-null connection_id", async () => {
    mockMaybySingle.mockResolvedValue({
      data: { ...MANUAL_ACCOUNT, connection_id: "conn-uuid-abc" },
      error: null,
    });
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("ACCOUNT_NOT_MANUAL");
  });
});

// ── AC-7: 400 ROW_LIMIT_EXCEEDED ──────────────────────────────────────────────
describe("AC-7: row limit", () => {
  it("returns 400 ROW_LIMIT_EXCEEDED for > 10,000 rows", async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => row({ description: `row-${i}` }));
    const res = await POST(...makeReq({ rows }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; limit: number };
    expect(body.error).toBe("ROW_LIMIT_EXCEEDED");
    expect(body.limit).toBe(10_000);
  });

  it("accepts exactly 10,000 rows (at the limit, not over)", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => row({ description: `row-${i}` }));
    mockIngestTransactions.mockResolvedValue({ inserted: 10_000, superseded: 0, removed: 0 });
    const res = await POST(...makeReq({ rows }));
    expect(res.status).toBe(200);
  });
});

// ── Malformed row validation (Standard Experience Checklist edge case) ────────
describe("row validation", () => {
  it("returns 400 when rows is not an array", async () => {
    const res = await POST(...makeReq({ rows: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a row is missing occurredOn", async () => {
    const bad = { description: "Coffee", amount: "4.50", direction: "debit" };
    const res = await POST(...makeReq({ rows: [bad] }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe("validation");
    expect(body.message).toBeTruthy();
  });

  it("returns 400 when a row has a zero amount (guard: zero-amount rows must be excluded)", async () => {
    const bad = row({ amount: "0.00" });
    const res = await POST(...makeReq({ rows: [bad] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a row has an invalid direction", async () => {
    const bad = row({ direction: "both" as unknown as "debit" });
    const res = await POST(...makeReq({ rows: [bad] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a row has an invalid date format (not YYYY-MM-DD)", async () => {
    const bad = row({ occurredOn: "06/01/2026" });
    const res = await POST(...makeReq({ rows: [bad] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a row has an empty description", async () => {
    const bad = row({ description: "" });
    const res = await POST(...makeReq({ rows: [bad] }));
    expect(res.status).toBe(400);
  });
});

// ── AC-8 + AC-10: successful import — correct mapping and result shape ────────
describe("AC-8 / AC-10: successful import", () => {
  it("returns 200 with { inserted, superseded, removed } from ingestTransactions", async () => {
    mockIngestTransactions.mockResolvedValue({ inserted: 2, superseded: 0, removed: 0 });
    const rows = [row(), row({ description: "Grocery", amount: "80.00", occurredOn: "2026-06-02" })];
    const res = await POST(...makeReq({ rows }));
    expect(res.status).toBe(200);
    const body = await res.json() as { inserted: number; superseded: number; removed: number };
    expect(body.inserted).toBe(2);
    expect(body.superseded).toBe(0);
    expect(body.removed).toBe(0);
  });

  // AC-8: verifies ingestTransactions is called with correct NormalizedTransaction shape.
  it("calls ingestTransactions with source='csv', providerTransactionId=null, providerAccountId=null, currency from account", async () => {
    mockIngestTransactions.mockResolvedValue({ inserted: 1, superseded: 0, removed: 0 });
    await POST(...makeReq({ rows: [row({ category: "Food" })] }));

    expect(mockIngestTransactions).toHaveBeenCalledOnce();
    const call = mockIngestTransactions.mock.calls[0][0] as {
      userId: string;
      page: { added: Array<{ source: string; providerTransactionId: null; providerAccountId: null; currency: string; kind: string }> };
      accountIdByProviderAccountId: Map<string, string>;
    };
    const added = call.page.added;
    expect(added).toHaveLength(1);
    expect(added[0].source).toBe("csv");
    expect(added[0].providerTransactionId).toBeNull();
    expect(added[0].providerAccountId).toBeNull();
    expect(added[0].currency).toBe("USD"); // from the manual account's currency
    expect(added[0].kind).toBe("spend");
  });

  // AC-9: verifies ingestTransactions receives the 'manual' map key.
  it("calls ingestTransactions with accountIdByProviderAccountId: Map([['manual', accountId]])", async () => {
    mockIngestTransactions.mockResolvedValue({ inserted: 1, superseded: 0, removed: 0 });
    await POST(...makeReq({ rows: [row()] }));

    const call = mockIngestTransactions.mock.calls[0][0] as {
      accountIdByProviderAccountId: Map<string, string>;
    };
    expect(call.accountIdByProviderAccountId.get("manual")).toBe(VALID_UUID);
  });

  it("propagates non-USD currency from the account to each mapped row", async () => {
    mockMaybySingle.mockResolvedValue({
      data: { ...MANUAL_ACCOUNT, currency: "EUR" },
      error: null,
    });
    mockIngestTransactions.mockResolvedValue({ inserted: 1, superseded: 0, removed: 0 });
    await POST(...makeReq({ rows: [row()] }));

    const call = mockIngestTransactions.mock.calls[0][0] as {
      page: { added: Array<{ currency: string }> };
    };
    expect(call.page.added[0].currency).toBe("EUR");
  });
});

// ── AC-11 (idempotency is enforced by the ingest pipeline) ───────────────────
describe("AC-11: idempotency via ingestTransactions (unit-level proxy)", () => {
  it("returns inserted=0 when ingestTransactions reports no new rows (replay)", async () => {
    mockIngestTransactions.mockResolvedValue({ inserted: 0, superseded: 0, removed: 0 });
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { inserted: number };
    expect(body.inserted).toBe(0);
  });
});

// ── Server error path ─────────────────────────────────────────────────────────
describe("server error handling", () => {
  it("returns 500 when ingestTransactions throws", async () => {
    mockIngestTransactions.mockRejectedValue(new Error("DB failure"));
    const res = await POST(...makeReq({ rows: [row()] }));
    expect(res.status).toBe(500);
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const req = new Request(`http://localhost/api/accounts/${VALID_UUID}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(400);
  });
});

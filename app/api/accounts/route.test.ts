// WLT-27-2 — Integration tests for POST /api/accounts.
// Covers: AC-2 (401 unauth), AC-3 (403 flag off), AC-4 (400 non-USD),
//         AC-5 (kind mapping + 400 on bad kind), AC-6 (success shape).
// regression: false  e2e: false

import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { mockGetAal2UserId, mockInsertSingle } = vi.hoisted(() => ({
  mockGetAal2UserId: vi.fn(),
  mockInsertSingle: vi.fn(),
}));

vi.mock("@vc1023/passkey-2fa", () => ({
  getAal2UserId: mockGetAal2UserId,
  createServiceSupabase: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: mockInsertSingle }),
      }),
    }),
  }),
}));

function makeReq(body: object): Request {
  return new Request("http://localhost/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/accounts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, MANUAL_ACCOUNTS_ENABLED: "true", MULTI_CURRENCY_ACCOUNTS_ENABLED: undefined };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // AC-2: 401 when not authenticated
  it("returns 401 when unauthenticated (getAal2UserId returns null)", async () => {
    mockGetAal2UserId.mockResolvedValue(null);
    const res = await POST(makeReq({ name: "Test", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  // AC-3: 403 when MANUAL_ACCOUNTS_ENABLED is off
  it("returns 403 with MANUAL_ACCOUNTS_DISABLED when flag is off", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    process.env.MANUAL_ACCOUNTS_ENABLED = undefined;
    const res = await POST(makeReq({ name: "Test", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("MANUAL_ACCOUNTS_DISABLED");
  });

  it("returns 403 when MANUAL_ACCOUNTS_ENABLED is 'false'", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    process.env.MANUAL_ACCOUNTS_ENABLED = "false";
    const res = await POST(makeReq({ name: "Test", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(403);
  });

  // AC-4: 400 when non-USD and MULTI_CURRENCY_ACCOUNTS_ENABLED is off
  it("returns 400 MULTI_CURRENCY_DISABLED for non-USD when flag is off", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED = undefined;
    const res = await POST(makeReq({ name: "Euro Acct", kind: "checking", currency: "EUR" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("MULTI_CURRENCY_DISABLED");
  });

  it("accepts non-USD when MULTI_CURRENCY_ACCOUNTS_ENABLED is on", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED = "true";
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-1", name: "Euro Acct", kind: "depository", currency: "EUR" },
      error: null,
    });
    const res = await POST(makeReq({ name: "Euro Acct", kind: "checking", currency: "EUR" }));
    expect(res.status).toBe(200);
  });

  // AC-5: kind mapping
  it("maps checking → depository in the DB insert", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-1", name: "My Checking", kind: "depository", currency: "USD" },
      error: null,
    });
    const res = await POST(makeReq({ name: "My Checking", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { account: { kind: string } };
    expect(body.account.kind).toBe("depository");
  });

  it("maps savings → depository in the DB insert", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-2", name: "My Savings", kind: "depository", currency: "USD" },
      error: null,
    });
    const res = await POST(makeReq({ name: "My Savings", kind: "savings", currency: "USD" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { account: { kind: string } };
    expect(body.account.kind).toBe("depository");
  });

  it("maps credit → credit (pass-through)", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-3", name: "My CC", kind: "credit", currency: "USD" },
      error: null,
    });
    const res = await POST(makeReq({ name: "My CC", kind: "credit", currency: "USD" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { account: { kind: string } };
    expect(body.account.kind).toBe("credit");
  });

  it("maps investment → investment (pass-through; new kind added by 0020 migration)", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-4", name: "My Brokerage", kind: "investment", currency: "USD" },
      error: null,
    });
    const res = await POST(makeReq({ name: "My Brokerage", kind: "investment", currency: "USD" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { account: { kind: string } };
    expect(body.account.kind).toBe("investment");
  });

  it("returns 400 on unrecognized kind (e.g. 'mortgage')", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    const res = await POST(makeReq({ name: "Bad", kind: "mortgage", currency: "USD" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; field: string };
    expect(body.error).toBe("validation");
    expect(body.field).toBe("kind");
  });

  // AC-6: success returns { account: { id, name, kind, currency } }
  it("returns 200 with account shape on success", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({
      data: { id: "acct-uuid", name: "Cash App", kind: "depository", currency: "USD" },
      error: null,
    });
    const res = await POST(makeReq({ name: "Cash App", kind: "checking", currency: "USD", institutionName: "Cash App" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { account: { id: string; name: string; kind: string; currency: string } };
    expect(body.account.id).toBe("acct-uuid");
    expect(body.account.name).toBe("Cash App");
    expect(body.account.kind).toBe("depository");
    expect(body.account.currency).toBe("USD");
  });

  it("returns 400 when name is empty", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    const res = await POST(makeReq({ name: "   ", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; field: string };
    expect(body.error).toBe("validation");
    expect(body.field).toBe("name");
  });

  it("returns 400 for a currency code outside the allowlist", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    process.env.MULTI_CURRENCY_ACCOUNTS_ENABLED = "true";
    const res = await POST(makeReq({ name: "Test", kind: "checking", currency: "XYZ" }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; field: string };
    expect(body.error).toBe("validation");
    expect(body.field).toBe("currency");
  });

  it("returns 500 on Supabase insert error", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockInsertSingle.mockResolvedValue({ data: null, error: { message: "db error" } });
    const res = await POST(makeReq({ name: "Test", kind: "checking", currency: "USD" }));
    expect(res.status).toBe(500);
  });
});

import { describe, expect, it } from "vitest";
import { verifyPlaidWebhook } from "./webhook";

// The security-critical contract: an unverified webhook NEVER yields a payload
// (the route rejects null with 401 + never acts on it). The happy path needs a
// real Plaid-signed JWT (exercised in prod/E2E); here we lock the rejections.
describe("verifyPlaidWebhook", () => {
  const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "x" });

  it("rejects a missing verification header", async () => {
    expect(await verifyPlaidWebhook(null, body)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyPlaidWebhook("not-a-jwt", body)).toBeNull();
  });

  it("rejects a non-ES256 token (before any key fetch)", async () => {
    // Valid JWT shape but wrong alg — rejected pre-network, no key lookup.
    const t = `${Buffer.from('{"alg":"HS256","kid":"k"}').toString("base64url")}.${Buffer.from(body).toString("base64url")}.sig`;
    expect(await verifyPlaidWebhook(t, body)).toBeNull();
  });
});

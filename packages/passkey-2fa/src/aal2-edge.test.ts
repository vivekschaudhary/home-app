import { describe, expect, it } from "vitest";
import {
  AAL2_COOKIE,
  AAL2_TTL_SECONDS,
  renewedAal2Cookie,
  signAal2Token,
  verifyAal2Token,
} from "./aal2";
import { renewedAal2CookieEdge } from "./aal2-edge";

// The Edge (WebCrypto) renewal MUST stay byte-compatible + decision-identical
// with the Node (node:crypto) renewal. If they drift, a token minted on one side
// fails to verify on the other → spurious re-challenge → the "forced logout"
// defect comes back through the side door. This is the parity guard.

const SECRET = "test-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const SID = "sess-abc";
const NOW = 1_700_000_000;

describe("AAL2 Edge ↔ Node parity", () => {
  it("a Node-minted token verifies + renews on the Edge with an identical cookie", async () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    const deep = NOW + AAL2_TTL_SECONDS - 60; // in the renewal window, still valid

    const node = renewedAal2Cookie(token, USER, SID, SECRET, deep, true);
    const edge = await renewedAal2CookieEdge(token, USER, SID, SECRET, true, deep);

    expect(node).not.toBeNull();
    expect(edge).not.toBeNull();
    expect(edge!.name).toBe(AAL2_COOKIE);
    // Same token value (same payload + same HMAC) and same options.
    expect(edge!.value).toBe(node!.value);
    expect(edge!.options).toEqual(node!.options);
    // An Edge-renewed token verifies under the Node verifier.
    expect(verifyAal2Token(edge!.value, SECRET, deep)).toEqual({ sub: USER, sid: SID });
  });

  it("Edge renewal is fail-closed on the same conditions as Node", async () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);

    // Too early → no renewal on either side.
    expect(await renewedAal2CookieEdge(token, USER, SID, SECRET, true, NOW + 60)).toBeNull();
    // Expired.
    expect(
      await renewedAal2CookieEdge(token, USER, SID, SECRET, true, NOW + AAL2_TTL_SECONDS + 1),
    ).toBeNull();
    // Wrong secret / forged.
    expect(await renewedAal2CookieEdge(token, USER, SID, "wrong", true, NOW + 60)).toBeNull();
    expect(await renewedAal2CookieEdge("garbage", USER, SID, SECRET, true, NOW + 60)).toBeNull();
    // sub / sid mismatch.
    const deep = NOW + AAL2_TTL_SECONDS - 60;
    expect(await renewedAal2CookieEdge(token, "other", SID, SECRET, true, deep)).toBeNull();
    expect(await renewedAal2CookieEdge(token, USER, "other-sid", SECRET, true, deep)).toBeNull();
  });

  it("respects the `secure` flag (dev vs prod cookie)", async () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    const deep = NOW + AAL2_TTL_SECONDS - 60;
    const dev = await renewedAal2CookieEdge(token, USER, SID, SECRET, false, deep);
    const prod = await renewedAal2CookieEdge(token, USER, SID, SECRET, true, deep);
    expect(dev!.options.secure).toBe(false);
    expect(prod!.options.secure).toBe(true);
  });
});

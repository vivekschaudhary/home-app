import { afterEach, describe, expect, it, vi } from "vitest";
import { postJSON } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJSON error discrimination (AC6)", () => {
  it("maps a thrown fetch (offline) to network", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("failed")));
    expect(await postJSON("/x")).toEqual({ ok: false, error: "network" });
  });

  it("passes through a server error code", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: "invalid_credentials" }), { status: 401 })),
    );
    expect(await postJSON("/x")).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("defaults a non-ok response without a code to server", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("boom", { status: 500 })));
    expect(await postJSON("/x")).toEqual({ ok: false, error: "server" });
  });

  it("returns ok on success", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    expect((await postJSON("/x")).ok).toBe(true);
  });
});

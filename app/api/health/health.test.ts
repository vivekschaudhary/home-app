import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("returns ok with service identity and checks", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("wealth-platform");
    expect(body.checks).toBeDefined();
    expect(body.checks.app).toBe("ok");
  });
});

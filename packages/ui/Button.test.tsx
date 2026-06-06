// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";

afterEach(() => cleanup());

describe("Button loading state (AC5)", () => {
  it("shows the loading label, disables, and sets aria-busy", () => {
    render(
      <Button loading loadingLabel="Creating account…">
        Create account
      </Button>,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain("Creating account…");
  });

  it("renders children and is enabled when not loading", () => {
    render(<Button>Create account</Button>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("Create account");
  });
});

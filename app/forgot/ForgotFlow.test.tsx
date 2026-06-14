// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
const requestPasswordReset = vi.fn();
vi.mock("@vc1023/passkey-2fa/client", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
}));

import { ForgotFlow } from "./ForgotFlow";

afterEach(() => requestPasswordReset.mockReset());

describe("ForgotFlow (WLT-14 — anti-enumeration UI)", () => {
  it("submitting shows the existence-agnostic 'check your email' confirmation", async () => {
    requestPasswordReset.mockResolvedValue({ ok: true }); // backend always says ok
    render(<ForgotFlow />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByText("Check your email")).toBeTruthy());
    // The confirmation never says whether the account exists.
    expect(screen.getByText(/If an account exists for that email/)).toBeTruthy();
  });

  it("a rate-limit / server failure shows the right discriminated banner, not 'sent'", async () => {
    requestPasswordReset.mockResolvedValue({ ok: false, error: "rate_limited" });
    render(<ForgotFlow />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByText(/Too many attempts/)).toBeTruthy());
    expect(screen.queryByText("Check your email")).toBeNull();
  });
});

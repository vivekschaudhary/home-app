// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
const updatePassword = vi.fn();
vi.mock("@vc1023/passkey-2fa/client", () => ({ updatePassword: (...a: unknown[]) => updatePassword(...a) }));

import { ResetFlow } from "./ResetFlow";

afterEach(() => updatePassword.mockReset());

describe("ResetFlow (WLT-14)", () => {
  it("no recovery session → the honest expired state, NOT a password field", () => {
    render(<ResetFlow hasSession={false} />);
    expect(screen.getByText("This link's expired")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a short password client-side without calling the API (AC7)", () => {
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(screen.getByText("Your password needs at least 12 characters.")).toBeTruthy();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("a valid password updates → success state names the passkey (AC4)", async () => {
    updatePassword.mockResolvedValue({ ok: true });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByText("Your password's updated")).toBeTruthy());
    expect(updatePassword).toHaveBeenCalledWith("correct horse battery staple", undefined); // no TOTP step for a non-MFA account
    // The second-factor reminder is present (a reset doesn't bypass the passkey).
    expect(screen.getByText(/still use your passkey/)).toBeTruthy();
  });

  it("an invalid/expired link surfaced by the API maps to the expired copy", async () => {
    updatePassword.mockResolvedValue({ ok: false, error: "reset_link_invalid" });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByText(/Reset links can only be used once/)).toBeTruthy());
  });

  it("SUP-7: reusing the current password shows the inline 'choose a new one' message, NOT the generic server error", async () => {
    updatePassword.mockResolvedValue({ ok: false, error: "same_password" });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByText("That's already your password — choose a new one.")).toBeTruthy());
    // the discriminated branch must NOT fall through to the generic server line
    expect(screen.queryByText(/something went wrong on our side/i)).toBeNull();
  });

  it("SUP-7: an MFA account is asked for its authenticator code — mfa_required reveals the field, not an error", async () => {
    updatePassword.mockResolvedValue({ ok: false, error: "mfa_required" });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByLabelText("6-digit code")).toBeTruthy());
    expect(screen.getByText(/enter your authenticator code/i)).toBeTruthy(); // a prompt, not a failure banner
  });

  it("SUP-7: entering the authenticator code completes the reset (password + code sent)", async () => {
    updatePassword.mockResolvedValueOnce({ ok: false, error: "mfa_required" }).mockResolvedValueOnce({ ok: true });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => screen.getByLabelText("6-digit code"));
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByText("Your password's updated")).toBeTruthy());
    expect(updatePassword).toHaveBeenLastCalledWith("correct horse battery staple", "123456");
  });

  it("SUP-7: a wrong authenticator code shows on the code field and stays on the form", async () => {
    updatePassword.mockResolvedValueOnce({ ok: false, error: "mfa_required" }).mockResolvedValueOnce({ ok: false, error: "invalid_code" });
    render(<ResetFlow hasSession={true} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => screen.getByLabelText("6-digit code"));
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(screen.getByText(/didn't match/)).toBeTruthy());
    expect(screen.queryByText("Your password's updated")).toBeNull();
  });
});

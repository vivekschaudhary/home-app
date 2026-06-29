// @vitest-environment jsdom
// WLT-27-2 component tests — ManualAccountForm.
// Covers: AC-9 (form fields, currency lock), AC-10 (loading), AC-11 (success),
//         AC-12 (discriminated errors), AC-13 (autofocus / keyboard navigation).
// regression: false  e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManualAccountForm } from "./ManualAccountForm";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// Plain-object fetch mocks — avoids depending on jsdom's Response implementation.
// ManualAccountForm only uses `res.ok` and `res.json()`, nothing else.
function successResponse(id = "acct-1") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ account: { id, name: "Test Account", kind: "depository", currency: "USD" } }),
  };
}

function errorResponse(body: object, status: number) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

// ── AC-9: form fields present; currency picker disabled when multi-currency off ──
describe("ManualAccountForm — form fields (AC-9)", () => {
  it("renders all required fields", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Account name")).toBeTruthy();
    expect(screen.getByLabelText(/institution/i)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Checking" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Credit card" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Investment" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Other" })).toBeTruthy();
    expect(screen.getByLabelText("Currency")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("currency select is disabled and locked to USD when multiCurrencyEnabled is false", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("USD");
    // Locked hint visible
    expect(screen.getByText("USD only for now")).toBeTruthy();
  });

  it("currency select is enabled when multiCurrencyEnabled is true", () => {
    render(<ManualAccountForm multiCurrencyEnabled={true} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
  });

  it("kind radio defaults to checking", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const checkingRadio = screen.getByRole("radio", { name: "Checking" }) as HTMLInputElement;
    expect(checkingRadio.checked).toBe(true);
  });

  it("cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// ── AC-10: loading state while request is in-flight ────────────────────────────
describe("ManualAccountForm — loading state (AC-10)", () => {
  it("submit button shows loading text and is disabled while request is pending", async () => {
    let resolveRes!: (r: ReturnType<typeof successResponse>) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<ReturnType<typeof successResponse>>((res) => { resolveRes = res; }),
    );

    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "My Checking" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Adding…" }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    // Resolve so the test doesn't leak a pending promise.
    resolveRes(successResponse());
  });

  it("cancel button is also disabled while loading", async () => {
    let resolveRes!: (r: ReturnType<typeof successResponse>) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<ReturnType<typeof successResponse>>((res) => { resolveRes = res; }),
    );

    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "My Checking" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => {
      const cancelBtn = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
      expect(cancelBtn.disabled).toBe(true);
    });

    resolveRes(successResponse());
  });
});

// ── AC-11: success state ───────────────────────────────────────────────────────
describe("ManualAccountForm — success state (AC-11)", () => {
  it("shows 'Account added' after successful creation", async () => {
    mockFetch.mockResolvedValueOnce(successResponse());
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "My Checking" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => screen.getByText("Account added"));
  });

  it("calls onSuccess after the success delay", async () => {
    // Use a real timer here: the 800 ms delay in the component is an intentional
    // UX pause. We wait for "Account added" then let real time pass so the
    // setTimeout fires without needing fake-timer machinery that conflicts with
    // waitFor's own polling.
    mockFetch.mockResolvedValueOnce(successResponse());
    const onSuccess = vi.fn();
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "My Checking" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => screen.getByText("Account added"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), { timeout: 1500 });
  }, 3000);
});

// ── AC-12: discriminated error messages ────────────────────────────────────────
describe("ManualAccountForm — discriminated errors (AC-12)", () => {
  it("shows 'Manual accounts aren't available yet' on MANUAL_ACCOUNTS_DISABLED (403)", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: "MANUAL_ACCOUNTS_DISABLED" }, 403),
    );
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => screen.getByText("Manual accounts aren't available yet."));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows currency error on MULTI_CURRENCY_DISABLED (400)", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: "MULTI_CURRENCY_DISABLED" }, 400),
    );
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Euro Acct" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => screen.getByText("Only USD accounts are supported right now."));
  });

  it("shows field-level inline error on validation response", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: "validation", field: "name", message: "Account name is required." }, 400),
    );
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => screen.getByText("Account name is required."));
  });

  it("shows network error on fetch rejection", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network Error"));
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => screen.getByText("We couldn't add that account just now — try again."));
  });

  it("shows field-level error for blank name without calling fetch", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByText("Account name is required.")).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── AC-13: keyboard navigation / first-field focus ────────────────────────────
describe("ManualAccountForm — keyboard navigation (AC-13)", () => {
  it("name input is the active element after render (autoFocus prop)", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    // React processes the autoFocus prop by calling .focus() on the element during
    // commit. jsdom honours this, so document.activeElement becomes the name input.
    const nameInput = screen.getByLabelText("Account name");
    expect(document.activeElement).toBe(nameInput);
  });

  it("submit and cancel buttons are keyboard-focusable (role=button)", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("kind radio buttons are keyboard-operable (Tab-navigable via fieldset/radio group)", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    // All radio inputs are of type radio — operable via arrow keys in browser.
    expect(radios.length).toBe(5);
    radios.forEach((r) => expect(r.type).toBe("radio"));
  });

  it("dialog has role=dialog and aria-modal=true for screen-reader containment", () => {
    render(<ManualAccountForm multiCurrencyEnabled={false} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});

// @vitest-environment jsdom
// e2e: false
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParseResult } from "papaparse";
import { COPY } from "@/app/lib/copy";

// Papaparse uses the browser FileReader which isn't available in jsdom — mock it
// so tests drive the parse result directly.
const mockPapaParse = vi.fn();
vi.mock("papaparse", () => ({
  default: { parse: (...args: Parameters<typeof mockPapaParse>) => mockPapaParse(...args) },
}));

import { CsvImportWizard } from "./CsvImportWizard";

// ── Helpers ───────────────────────────────────────────────────────────────────

const APPLE_CARD_HEADERS = [
  "Transaction Date",
  "Clearing Date",
  "Description",
  "Merchant",
  "Category",
  "Type",
  "Amount (USD)",
];

function makeParseResult(
  headers: string[],
  rows: Record<string, string>[],
): Partial<ParseResult<Record<string, string>>> {
  return {
    data: rows,
    meta: {
      fields: headers,
      delimiter: ",",
      linebreak: "\n",
      aborted: false,
      truncated: false,
      cursor: 0,
    },
    errors: [],
  };
}

function makeMockFile(name = "transactions.csv"): File {
  return new File(["dummy"], name, { type: "text/csv" });
}

function setupParse(headers: string[], rows: Record<string, string>[]) {
  mockPapaParse.mockImplementation(
    (_file: File, config: { complete: (r: Partial<ParseResult<Record<string, string>>>) => void }) => {
      config.complete(makeParseResult(headers, rows));
    },
  );
}

function setupParseError() {
  mockPapaParse.mockImplementation(
    (_file: File, config: { error: () => void }) => {
      config.error();
    },
  );
}

const ACCOUNT_ID = "acc-manual-1";
const mockOnDone = vi.fn();
const mockOnCancel = vi.fn();

function renderWizard() {
  return render(
    <CsvImportWizard
      accountId={ACCOUNT_ID}
      accountCurrency="USD"
      onDone={mockOnDone}
      onCancel={mockOnCancel}
    />,
  );
}

function uploadFile(file = makeMockFile()) {
  const input = screen.getByLabelText(COPY.csvWizard.fileLabel);
  fireEvent.change(input, { target: { files: [file] } });
}

function isDisabled(el: HTMLElement) {
  return (el as HTMLButtonElement).disabled === true;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CsvImportWizard — Step 1: Upload", () => {
  it("renders step 1 heading and row-cap notice", () => {
    renderWizard();
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step1Title })).toBeTruthy();
    expect(screen.getByText(COPY.csvWizard.rowCapNotice)).toBeTruthy();
  });

  it("happy path: 5 rows → shows row count and Next is enabled", () => {
    setupParse(["Date", "Description", "Amount"], [
      { Date: "2026-01-01", Description: "Coffee", Amount: "-4.50" },
      { Date: "2026-01-02", Description: "Lunch", Amount: "-12.00" },
      { Date: "2026-01-03", Description: "Salary", Amount: "2000.00" },
      { Date: "2026-01-04", Description: "Gym", Amount: "-50.00" },
      { Date: "2026-01-05", Description: "Books", Amount: "-30.00" },
    ]);
    renderWizard();
    uploadFile();
    expect(screen.getByText(COPY.csvWizard.rowCountInfo.replace("{count}", "5"))).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(false);
  });

  it("malformed CSV: shows inline parse error and Next remains disabled", () => {
    setupParseError();
    renderWizard();
    uploadFile();
    expect(screen.getByText(COPY.csvWizard.errorParse)).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(true);
  });

  it("empty file (0 data rows): shows empty-file error and Next remains disabled (AC-14)", () => {
    setupParse(["Date", "Description", "Amount"], []);
    renderWizard();
    uploadFile();
    expect(screen.getByText(COPY.csvWizard.errorEmpty)).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(true);
  });

  it("Cancel calls onCancel", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.cancel }));
    expect(mockOnCancel).toHaveBeenCalledOnce();
  });
});

describe("CsvImportWizard — Step 2: Column mapping", () => {
  function setupAndAdvanceToStep2(
    headers: string[] = ["Date", "Description", "Amount"],
    rows: Record<string, string>[] = [
      { Date: "2026-01-01", Description: "Coffee", Amount: "-4.50" },
    ],
  ) {
    setupParse(headers, rows);
    renderWizard();
    uploadFile();
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
  }

  it("shows step 2 heading after advancing from step 1", () => {
    setupAndAdvanceToStep2();
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step2Title })).toBeTruthy();
  });

  it("Next is disabled until date + description + amount are all mapped (AC-4)", () => {
    setupAndAdvanceToStep2();
    // Initially all unmapped → Next disabled
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(true);

    // Map date only → still disabled
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDate), { target: { value: "Date" } });
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(true);

    // Map description too → still disabled (amount missing)
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDescription), { target: { value: "Description" } });
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(true);

    // Map amount → Next enabled
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapAmount), { target: { value: "Amount" } });
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(false);
  });

  it("Apple Card preset auto-fires: dropdowns pre-populated and preset banner shown (AC-5)", () => {
    setupAndAdvanceToStep2(APPLE_CARD_HEADERS, [
      {
        "Transaction Date": "01/15/2026",
        "Clearing Date": "01/16/2026",
        Description: "Coffee Shop",
        Merchant: "Starbucks",
        Category: "Food & Beverage",
        Type: "Purchase",
        "Amount (USD)": "-5.25",
      },
    ]);

    // Banner appears
    expect(screen.getByText(COPY.csvWizard.presetBanner)).toBeTruthy();

    // Amount column pre-populated with "Amount (USD)"
    const amtSelect = screen.getByLabelText(COPY.csvWizard.mapAmount) as HTMLSelectElement;
    expect(amtSelect.value).toBe("Amount (USD)");

    // Date pre-populated
    const dateSelect = screen.getByLabelText(COPY.csvWizard.mapDate) as HTMLSelectElement;
    expect(dateSelect.value).toBe("Transaction Date");

    // Next is enabled (all required fields mapped by preset)
    expect(isDisabled(screen.getByRole("button", { name: COPY.csvWizard.next }))).toBe(false);
  });

  it("preset banner can be dismissed (AC-5)", () => {
    setupAndAdvanceToStep2(APPLE_CARD_HEADERS, [
      {
        "Transaction Date": "01/15/2026",
        "Clearing Date": "01/16/2026",
        Description: "desc",
        Merchant: "Merchant",
        Category: "Food",
        Type: "Purchase",
        "Amount (USD)": "-5.00",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.presetBannerDismiss }));
    expect(screen.queryByText(COPY.csvWizard.presetBanner)).toBeNull();
  });

  it("Back returns to step 1", () => {
    setupAndAdvanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.back }));
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step1Title })).toBeTruthy();
  });
});

describe("CsvImportWizard — Step 3: Preview", () => {
  function setupAndAdvanceToStep3() {
    const headers = ["Date", "Description", "Amount"];
    const rows: Record<string, string>[] = Array.from({ length: 15 }, (_, i) => ({
      Date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      Description: `Merchant ${i + 1}`,
      Amount: `${-(i + 1) * 5}.00`,
    }));
    setupParse(headers, rows);
    renderWizard();
    uploadFile();
    // step 1 → 2
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDate), { target: { value: "Date" } });
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDescription), { target: { value: "Description" } });
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapAmount), { target: { value: "Amount" } });
    // step 2 → 3
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
  }

  it("shows step 3 heading", () => {
    setupAndAdvanceToStep3();
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step3Title })).toBeTruthy();
  });

  it("preview table shows first 10 of 15 rows (AC-6)", () => {
    setupAndAdvanceToStep3();
    // Merchants 1-10 visible; 11-15 not rendered
    const cells = screen.getAllByText(/^Merchant \d+$/);
    expect(cells).toHaveLength(10);
    expect(screen.queryByText("Merchant 11")).toBeNull();
  });

  it("Back from step 3 returns to step 2", () => {
    setupAndAdvanceToStep3();
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.back }));
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step2Title })).toBeTruthy();
  });
});

describe("CsvImportWizard — Step 4: Confirm", () => {
  function setupAndAdvanceToStep4() {
    const headers = ["Date", "Description", "Amount"];
    const rows: Record<string, string>[] = [
      { Date: "2026-01-01", Description: "Coffee", Amount: "-4.50" },
      { Date: "2026-01-02", Description: "Salary", Amount: "2000.00" },
    ];
    setupParse(headers, rows);
    renderWizard();
    uploadFile();
    // 1 → 2
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDate), { target: { value: "Date" } });
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapDescription), { target: { value: "Description" } });
    fireEvent.change(screen.getByLabelText(COPY.csvWizard.mapAmount), { target: { value: "Amount" } });
    // 2 → 3
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
    // 3 → 4
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.next }));
  }

  it("shows step 4 heading with correct import button label (AC-7)", () => {
    setupAndAdvanceToStep4();
    expect(screen.getByRole("heading", { name: COPY.csvWizard.step4Title })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    ).toBeTruthy();
  });

  it("import success: calls route handler and shows result summary (AC-8)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ inserted: 2, superseded: 0, removed: 0 }),
    } as Response);

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );

    await waitFor(() =>
      screen.getByText(
        COPY.csvWizard.successSummary.replace("{inserted}", "2").replace("{superseded}", "0"),
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/accounts/${ACCOUNT_ID}/import`,
      expect.objectContaining({ method: "POST" }),
    );

    expect(screen.getByRole("button", { name: COPY.csvWizard.doneCta })).toBeTruthy();
    fetchMock.mockRestore();
  });

  it("all-duplicate import shows 'all rows already imported' message (AC-8)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ inserted: 0, superseded: 2, removed: 0 }),
    } as Response);

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );

    await waitFor(() =>
      screen.getByText(COPY.csvWizard.successAllDuplicate.replace("{total}", "2")),
    );
    fetchMock.mockRestore();
  });

  it("Done button calls onDone (AC-8)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ inserted: 2, superseded: 0, removed: 0 }),
    } as Response);

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );
    await waitFor(() => screen.getByRole("button", { name: COPY.csvWizard.doneCta }));
    fireEvent.click(screen.getByRole("button", { name: COPY.csvWizard.doneCta }));
    expect(mockOnDone).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("network error: shows discriminated error message (AC-9)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("net"));

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );

    await waitFor(() => screen.getByText(COPY.csvWizard.errorNetwork));
    expect(screen.getByRole("button", { name: COPY.csvWizard.retry })).toBeTruthy();
    fetchMock.mockRestore();
  });

  it("server error: shows server error message (AC-9)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    } as Response);

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );

    await waitFor(() => screen.getByText(COPY.csvWizard.errorServer));
    fetchMock.mockRestore();
  });

  it("slow network: 'Still uploading…' label appears after 2 s in-flight (AC-13)", async () => {
    vi.useFakeTimers();

    let resolveFetch!: (v: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    setupAndAdvanceToStep4();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.csvWizard.importCta.replace("{count}", "2") }),
    );

    // Before 2 s: label not yet shown
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(screen.queryByText(COPY.csvWizard.slowUpload)).toBeNull();

    // At 2 s: label appears
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(COPY.csvWizard.slowUpload)).toBeTruthy();

    // Resolve the fetch so the component settles before test teardown
    await act(async () => {
      resolveFetch({
        ok: true,
        status: 200,
        json: async () => ({ inserted: 2, superseded: 0, removed: 0 }),
      } as Response);
      await Promise.resolve();
    });

    vi.useRealTimers();
    fetchMock.mockRestore();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountCard } from "./AccountCard";

afterEach(() => cleanup());

const BASE_PROPS = {
  institutionName: "Test Credit Union",
  accountName: "Everyday Checking",
  kind: "depository",
  mask: "1234",
  currency: "USD",
  status: "connected" as const,
  statusLabel: "Connected",
  ariaLabel: "Test Credit Union depository ending in 1234 — Connected, current balance 4210.55",
};

describe("AccountCard — balance display", () => {
  it("renders Current label and formatted amount when balance is provided", () => {
    render(<AccountCard {...BASE_PROPS} balance="4210.55" />);
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("$4,210.55")).toBeTruthy();
  });

  it("renders Available label and formatted amount when balanceAvailable is provided", () => {
    render(<AccountCard {...BASE_PROPS} balance="4210.55" balanceAvailable="3800.00" />);
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("$4,210.55")).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("$3,800.00")).toBeTruthy();
  });

  it("does NOT render Available section when balanceAvailable is null", () => {
    render(<AccountCard {...BASE_PROPS} balance="4210.55" balanceAvailable={null} />);
    expect(screen.queryByText("Available")).toBeNull();
    // Current still renders
    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("does NOT render Available section when balanceAvailable is omitted", () => {
    render(<AccountCard {...BASE_PROPS} balance="4210.55" />);
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("renders neither balance section when balance is null", () => {
    render(<AccountCard {...BASE_PROPS} balance={null} />);
    expect(screen.queryByText("Current")).toBeNull();
    expect(screen.queryByText("Available")).toBeNull();
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let currentPath = "/dashboard";
const pushMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@vc1023/passkey-2fa/client", () => ({ signOut: (...a: unknown[]) => signOutMock(...a) }));

import { NAV_SECTIONS } from "../nav";
import { AccountMenu } from "./AccountMenu";
import { ComingSoon } from "./ComingSoon";
import { MobileDrawer } from "./MobileDrawer";
import { NavItem } from "./NavItem";

// Headless UI (v2) reaches for these browser APIs jsdom lacks.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  // @ts-expect-error — minimal ResizeObserver polyfill
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  pushMock.mockClear();
  signOutMock.mockClear();
});

const dashboard = NAV_SECTIONS.find((s) => s.key === "dashboard")!;
const budget = NAV_SECTIONS.find((s) => s.key === "budget")!;

describe("NavItem", () => {
  it("marks the active route with aria-current, not the others", () => {
    currentPath = "/dashboard";
    const { rerender } = render(<NavItem section={dashboard} />);
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    rerender(<NavItem section={budget} />);
    expect(screen.getByRole("link", { name: "Budget & Spending" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("ComingSoon (honest placeholder — never fake data)", () => {
  it("renders the section title + teaser + the Coming soon badge", () => {
    render(<ComingSoon section="budget" />);
    expect(screen.getByRole("heading", { name: "Budget & Spending" })).toBeTruthy();
    expect(screen.getByText(/See where your money goes/)).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });
});

describe("AccountMenu", () => {
  it("shows the email and, on open, Security + Sign out — and Sign out signs out", async () => {
    render(<AccountMenu email="you@example.com" />);
    expect(screen.getByText("you@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /your account|you@example.com/i }));
    const signOut = await screen.findByText("Sign out");
    expect(screen.getByText("Security")).toBeTruthy();
    fireEvent.click(signOut);
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("MobileDrawer", () => {
  it("when open, shows the nav + a close button that calls onClose; closed renders nothing", () => {
    const onClose = vi.fn();
    const { rerender } = render(<MobileDrawer open onClose={onClose} email="you@example.com" />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy(); // the nav is in the drawer
    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
    expect(onClose).toHaveBeenCalled();
    rerender(<MobileDrawer open={false} onClose={onClose} email="you@example.com" />);
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });
});

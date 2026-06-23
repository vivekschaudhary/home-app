// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionsViewDTO } from "@/app/lib/subscriptions-client";
import { COPY } from "@/app/lib/copy";

const fetchSubscriptionsMock = vi.fn();
const unmarkSubscriptionMock = vi.fn();
vi.mock("@/app/lib/subscriptions-client", () => ({
  fetchSubscriptions: () => fetchSubscriptionsMock(),
  unmarkSubscription: (dk: string) => unmarkSubscriptionMock(dk),
  markSubscription: vi.fn(),
}));

import { SubscriptionsClient } from "./SubscriptionsClient";

const VIEW: SubscriptionsViewDTO = {
  subscriptions: [
    { merchant: "Netflix", normKey: "netflix", typicalAmount: 15.49, cadence: "monthly", occurrences: 3, monthlyEquivalent: 15.49, dedupKeys: ["n1", "n2", "n3"], source: "user" },
    { merchant: "New Service", normKey: "newservice", typicalAmount: 99, cadence: "pending", occurrences: 1, monthlyEquivalent: null, dedupKeys: ["x1"], source: "user" },
  ],
  monthlyTotal: 15.49,
  annualTotal: 185.88,
};

// WLT-24-2 — a view with an auto-detected subscription (drives the "detected" tag + nudge).
const VIEW_WITH_DETECTED: SubscriptionsViewDTO = {
  subscriptions: [
    { merchant: "Netflix", normKey: "netflix", typicalAmount: 15.49, cadence: "monthly", occurrences: 4, monthlyEquivalent: 15.49, dedupKeys: ["n1", "n2", "n3", "n4"], source: "auto" },
    { merchant: "Spotify", normKey: "spotify", typicalAmount: 10.99, cadence: "monthly", occurrences: 3, monthlyEquivalent: 10.99, dedupKeys: ["s1", "s2", "s3"], source: "user" },
  ],
  monthlyTotal: 26.48,
  annualTotal: 317.76,
};

beforeEach(() => {
  fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: VIEW });
  unmarkSubscriptionMock.mockResolvedValue({ ok: true });
  localStorage.clear();
});
afterEach(() => {
  fetchSubscriptionsMock.mockReset();
  unmarkSubscriptionMock.mockReset();
});

describe("SubscriptionsClient (WLT-24-1)", () => {
  it("renders the headline + list; a pending row is labelled and excluded from the headline", () => {
    render(<SubscriptionsClient initial={VIEW} userId="u1" />);
    expect(screen.getByText(/\$15\.49 \/ month/)).toBeTruthy(); // only Netflix counts ($15.49), not the pending $99
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("New Service")).toBeTruthy();
    expect(screen.getByText(COPY.subscriptions.cadencePending)).toBeTruthy();
    expect(screen.getByText(COPY.subscriptions.pendingNote)).toBeTruthy();
  });

  it("honest empty state when nothing is marked", () => {
    const empty: SubscriptionsViewDTO = { subscriptions: [], monthlyTotal: 0, annualTotal: 0 };
    fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: empty });
    render(<SubscriptionsClient initial={empty} userId="u1" />);
    expect(screen.getByText(COPY.subscriptions.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: COPY.subscriptions.emptyCta })).toBeTruthy();
  });

  it("unmark dismisses the row's price series in ONE call (its dedupKeys), then refetches", async () => {
    render(<SubscriptionsClient initial={VIEW} userId="u1" />);
    fireEvent.click(screen.getAllByText(COPY.subscriptions.unmarkAction)[0]); // Netflix row
    await waitFor(() => expect(unmarkSubscriptionMock).toHaveBeenCalledTimes(1));
    expect(unmarkSubscriptionMock).toHaveBeenCalledWith(["n1", "n2", "n3"]); // exactly that series' keys
    await waitFor(() => expect(screen.getByText(COPY.subscriptions.unmarkedToast)).toBeTruthy());
  });
});

// WLT-24-3 — a vendor with two price series renders two rows; removing one touches
// only that series' dedupKeys (a sibling series is untouched).
const VIEW_TWO_SONY: SubscriptionsViewDTO = {
  subscriptions: [
    { merchant: "Sony PlayStation", normKey: "sony|c:45.00", typicalAmount: 45, cadence: "monthly", occurrences: 3, monthlyEquivalent: 45, dedupKeys: ["b1", "b2", "b3"], source: "user" },
    { merchant: "Sony PlayStation", normKey: "sony|c:13.99", typicalAmount: 13.99, cadence: "monthly", occurrences: 3, monthlyEquivalent: 13.99, dedupKeys: ["a1", "a2", "a3"], source: "user" },
  ],
  monthlyTotal: 58.99,
  annualTotal: 707.88,
};

describe("SubscriptionsClient — multi-sub vendor (WLT-24-3)", () => {
  beforeEach(() => fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: VIEW_TWO_SONY }));

  it("renders two rows for one vendor, distinguished by amount, with distinct a11y names", () => {
    render(<SubscriptionsClient initial={VIEW_TWO_SONY} userId="u1" />);
    expect(screen.getAllByText("Sony PlayStation")).toHaveLength(2);
    // distinct accessible row names (amount + cadence disambiguate the same-named rows)
    expect(screen.getByLabelText(/Sony PlayStation, \$45\.00, billed every month/)).toBeTruthy();
    expect(screen.getByLabelText(/Sony PlayStation, \$13\.99, billed every month/)).toBeTruthy();
  });

  it("removing one series calls unmark with only that series' dedupKeys (sibling untouched)", async () => {
    render(<SubscriptionsClient initial={VIEW_TWO_SONY} userId="u1" />);
    fireEvent.click(screen.getAllByText(COPY.subscriptions.unmarkAction)[0]); // first row = $45 series
    await waitFor(() => expect(unmarkSubscriptionMock).toHaveBeenCalledWith(["b1", "b2", "b3"]));
    expect(unmarkSubscriptionMock).not.toHaveBeenCalledWith(["a1", "a2", "a3"]); // the $13.99 sibling stays
  });
});

describe("SubscriptionsClient — auto-detection (WLT-24-2 AC7)", () => {
  beforeEach(() => {
    fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: VIEW_WITH_DETECTED });
  });

  it("tags an auto-detected row 'detected' and leaves user-marked rows untagged", () => {
    render(<SubscriptionsClient initial={VIEW_WITH_DETECTED} userId="u1" />);
    // exactly one "detected" tag — on Netflix (auto), not Spotify (user)
    expect(screen.getAllByText(COPY.subscriptions.detectedTag)).toHaveLength(1);
    expect(screen.getByLabelText(COPY.subscriptionsA11y.detectedTagA11y)).toBeTruthy();
  });

  it("shows the review nudge with the detected count; dismiss is sticky + per-user", () => {
    render(<SubscriptionsClient initial={VIEW_WITH_DETECTED} userId="u1" />);
    expect(screen.getByText(COPY.subscriptions.nudgeOne)).toBeTruthy(); // 1 detected → singular
    fireEvent.click(screen.getByRole("button", { name: COPY.subscriptionsA11y.nudgeDismissA11y }));
    expect(screen.queryByText(COPY.subscriptions.nudgeOne)).toBeNull();
    expect(localStorage.getItem("wlt24-2-detected-nudge-dismissed:u1")).toBe("1"); // per-user key
  });

  it("does not flash the nudge for a user who already dismissed it", () => {
    localStorage.setItem("wlt24-2-detected-nudge-dismissed:u1", "1");
    render(<SubscriptionsClient initial={VIEW_WITH_DETECTED} userId="u1" />);
    expect(screen.queryByText(COPY.subscriptions.nudgeOne)).toBeNull();
  });

  it("scopes dismissal per user — user A's dismissal doesn't hide user B's nudge", () => {
    localStorage.setItem("wlt24-2-detected-nudge-dismissed:userA", "1");
    render(<SubscriptionsClient initial={VIEW_WITH_DETECTED} userId="userB" />);
    expect(screen.getByText(COPY.subscriptions.nudgeOne)).toBeTruthy();
  });

  it("shows no nudge when nothing was auto-detected", () => {
    fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: VIEW }); // all user-marked
    render(<SubscriptionsClient initial={VIEW} userId="u1" />);
    expect(screen.queryByText(COPY.subscriptions.nudgeOne)).toBeNull();
    expect(screen.queryByText(COPY.subscriptions.detectedTag)).toBeNull();
  });
});

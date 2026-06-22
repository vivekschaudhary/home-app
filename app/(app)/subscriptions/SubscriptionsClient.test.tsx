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
    { merchant: "Netflix", normKey: "netflix", typicalAmount: 15.49, cadence: "monthly", occurrences: 3, monthlyEquivalent: 15.49, dedupKeys: ["n1", "n2", "n3"] },
    { merchant: "New Service", normKey: "newservice", typicalAmount: 99, cadence: "pending", occurrences: 1, monthlyEquivalent: null, dedupKeys: ["x1"] },
  ],
  monthlyTotal: 15.49,
  annualTotal: 185.88,
};

beforeEach(() => {
  fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: VIEW });
  unmarkSubscriptionMock.mockResolvedValue({ ok: true });
});
afterEach(() => {
  fetchSubscriptionsMock.mockReset();
  unmarkSubscriptionMock.mockReset();
});

describe("SubscriptionsClient (WLT-24-1)", () => {
  it("renders the headline + list; a pending row is labelled and excluded from the headline", () => {
    render(<SubscriptionsClient initial={VIEW} />);
    expect(screen.getByText(/\$15\.49 \/ month/)).toBeTruthy(); // only Netflix counts ($15.49), not the pending $99
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("New Service")).toBeTruthy();
    expect(screen.getByText(COPY.subscriptions.cadencePending)).toBeTruthy();
    expect(screen.getByText(COPY.subscriptions.pendingNote)).toBeTruthy();
  });

  it("honest empty state when nothing is marked", () => {
    const empty: SubscriptionsViewDTO = { subscriptions: [], monthlyTotal: 0, annualTotal: 0 };
    fetchSubscriptionsMock.mockResolvedValue({ ok: true, view: empty });
    render(<SubscriptionsClient initial={empty} />);
    expect(screen.getByText(COPY.subscriptions.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: COPY.subscriptions.emptyCta })).toBeTruthy();
  });

  it("unmark removes every charge behind the subscription, then refetches", async () => {
    render(<SubscriptionsClient initial={VIEW} />);
    fireEvent.click(screen.getAllByText(COPY.subscriptions.unmarkAction)[0]); // Netflix → 3 dedupKeys
    await waitFor(() => expect(unmarkSubscriptionMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(COPY.subscriptions.unmarkedToast)).toBeTruthy());
  });
});

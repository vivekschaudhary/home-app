// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const challengePasskey = vi.fn();
const signIn = vi.fn();
const signInWithTotp = vi.fn();
const getFactors = vi.fn();
const browserSupportsPasskeys = vi.fn();

vi.mock("@vc1023/passkey-2fa/client", async () => {
  // Keep the real zod schema so credential validation behaves authentically;
  // only the network/ceremony calls are stubbed.
  const { z } = await import("zod");
  return {
    signInSchema: z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
    challengePasskey: (...a: unknown[]) => challengePasskey(...a),
    signIn: (...a: unknown[]) => signIn(...a),
    signInWithTotp: (...a: unknown[]) => signInWithTotp(...a),
    getFactors: (...a: unknown[]) => getFactors(...a),
    browserSupportsPasskeys: (...a: unknown[]) => browserSupportsPasskeys(...a),
    challengeMfa: vi.fn(),
  };
});

import { SignInFlow } from "./SignInFlow";
import { COPY } from "@/app/lib/copy";

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function advanceToChallenge() {
  signIn.mockResolvedValue({ ok: true });
  fireEvent.change(screen.getByLabelText(COPY.signup.emailLabel), {
    target: { value: "a@example.com" },
  });
  fireEvent.change(screen.getByLabelText(COPY.signup.passwordLabel), {
    target: { value: "hunter2hunter2" },
  });
  fireEvent.click(screen.getByRole("button", { name: COPY.signin.cta }));
  await waitFor(() => expect(signIn).toHaveBeenCalled());
}

describe("SignInFlow — success suppresses the challenge prompt (regression)", () => {
  it("passkey success shows only 'Welcome back.', NOT 'Confirm it's you' / 'Try again'", async () => {
    browserSupportsPasskeys.mockReturnValue(true);
    getFactors.mockResolvedValue({ passkey: true, totp: false });
    challengePasskey.mockResolvedValue({ ok: true });

    render(<SignInFlow />);
    await advanceToChallenge();

    // Once the passkey ceremony succeeds, the success toast renders.
    await waitFor(() => expect(screen.getAllByText(COPY.signinSuccess).length).toBeGreaterThan(0));

    // BUG: the contradictory challenge prompt must be gone on success.
    expect(screen.queryByText(COPY.mfaChallenge.title)).toBeNull();
    expect(screen.queryByRole("button", { name: COPY.mfaChallenge.retry })).toBeNull();
  });

  it("authenticator (TOTP) success shows only 'Welcome back.', NOT the code prompt", async () => {
    browserSupportsPasskeys.mockReturnValue(true);
    getFactors.mockResolvedValue({ passkey: true, totp: true });
    // Passkey ceremony fails so the user falls back to the authenticator.
    challengePasskey.mockResolvedValue({ ok: false, reason: "cancelled" });
    signInWithTotp.mockResolvedValue({ ok: true });

    render(<SignInFlow />);
    await advanceToChallenge();

    // Switch to the authenticator sub-step.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.signinFallback.useAuthenticator }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: COPY.signinFallback.useAuthenticator }));

    fireEvent.change(screen.getByLabelText(COPY.totpChallenge.codeLabel), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(COPY.totpChallenge.cta, "i") }),
    );

    await waitFor(() => expect(screen.getAllByText(COPY.signinSuccess).length).toBeGreaterThan(0));

    // The code-entry prompt must be gone once verification succeeds.
    expect(screen.queryByText(COPY.totpChallenge.title)).toBeNull();
    expect(screen.queryByLabelText(COPY.totpChallenge.codeLabel)).toBeNull();
  });
});

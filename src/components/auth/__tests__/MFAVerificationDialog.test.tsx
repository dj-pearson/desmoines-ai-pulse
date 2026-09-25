import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Account plan WP1 item 1. A correct code used to run onSuccess and then
 * handleClose, and handleClose always ran onCancel - which /auth wires to
 * logout(). Two-factor users were signed out by the code that signed them in.
 *
 * The Supabase client is mocked at the module boundary: the dialog calls
 * mfa.challenge, mfa.verify and (with no factor id) mfa.listFactors directly.
 */

const challenge = vi.fn();
const verify = vi.fn();
const listFactors = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        challenge: (...args: unknown[]) => challenge(...args),
        verify: (...args: unknown[]) => verify(...args),
        listFactors: (...args: unknown[]) => listFactors(...args),
      },
    },
  },
}));

import { MFAVerificationDialog } from "@/components/auth/MFAVerificationDialog";

function setup(props: { factorId?: string | null } = { factorId: "factor-1" }) {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MFAVerificationDialog
      open
      onOpenChange={onOpenChange}
      factorId={props.factorId}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />,
  );
  return { onSuccess, onCancel, onOpenChange };
}

beforeEach(() => {
  challenge.mockReset().mockResolvedValue({ data: { id: "challenge-1" }, error: null });
  verify.mockReset().mockResolvedValue({ data: { access_token: "aal2" }, error: null });
  listFactors.mockReset().mockResolvedValue({
    data: { totp: [{ id: "factor-from-list", status: "verified" }] },
    error: null,
  });
});

describe("MFAVerificationDialog", () => {
  it("a correct code calls onSuccess and never onCancel (auto-submit)", async () => {
    const user = userEvent.setup();
    const { onSuccess, onCancel, onOpenChange } = setup();

    await waitFor(() => expect(challenge).toHaveBeenCalledWith({ factorId: "factor-1" }));
    await user.type(await screen.findByLabelText("Code"), "123456");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a correct code submitted with Enter verifies once and does not cancel", async () => {
    const user = userEvent.setup();
    const { onSuccess, onCancel } = setup();

    await waitFor(() => expect(challenge).toHaveBeenCalled());
    // The sixth digit auto-submits; Enter straight after must not verify the
    // same challenge a second time.
    await user.type(await screen.findByLabelText("Code"), "123456{Enter}");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("the Cancel button is the path that calls onCancel", async () => {
    const user = userEvent.setup();
    const { onSuccess, onCancel } = setup();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("finds the verified factor itself when none is passed", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup({ factorId: null });

    await waitFor(() => expect(challenge).toHaveBeenCalledWith({ factorId: "factor-from-list" }));
    await user.type(await screen.findByLabelText("Code"), "654321");
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(verify).toHaveBeenCalledWith({
      factorId: "factor-from-list",
      challengeId: "challenge-1",
      code: "654321",
    });
  });

  it("an expired challenge gets a fresh one and does not count as a wrong code", async () => {
    const user = userEvent.setup();
    verify.mockResolvedValueOnce({
      data: null,
      error: { code: "mfa_challenge_expired", message: "Challenge expired" },
    });
    const { onCancel } = setup();

    await waitFor(() => expect(challenge).toHaveBeenCalledTimes(1));
    await user.type(await screen.findByLabelText("Code"), "111111");

    await waitFor(() => expect(challenge).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/timed out/i)).toBeTruthy();
    expect(screen.queryByText(/tries left|try left/i)).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("a wrong code counts an attempt and keeps the dialog open", async () => {
    const user = userEvent.setup();
    verify.mockResolvedValueOnce({
      data: null,
      error: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" },
    });
    const { onSuccess, onCancel } = setup();

    await waitFor(() => expect(challenge).toHaveBeenCalled());
    await user.type(await screen.findByLabelText("Code"), "000000");

    expect(await screen.findByText(/4 tries left/)).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

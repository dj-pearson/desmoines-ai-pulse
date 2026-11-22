import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-ADS-047: an admin decision on a business claim tells the claimant, and a
 * verified owner can be revoked with a reason.
 */

type Row = Record<string, unknown>;
const claims: Row[] = [];
const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    let status = "";
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (_c: string, v: string) => {
      status = v;
      return b;
    };
    b.in = () =>
      Promise.resolve({ data: table === "restaurants" ? [{ id: "r1", name: "Zombie Burger", website: "https://zombieburger.com" }] : [], error: null });
    b.order = () => Promise.resolve({ data: claims.filter((c) => c.status === status), error: null });
    return b;
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: (...args: unknown[]) => rpc(...args),
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
    },
  };
});

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));

import BusinessClaimsManager from "@/components/admin/BusinessClaimsManager";

const base = {
  listing_type: "restaurant",
  listing_id: "r1",
  user_id: "u1",
  claimed_email: "owner@gmail.com",
  matched_domain: null,
  admin_notes: null,
  method: "email_domain",
  verified_at: null,
  created_at: "2026-11-10T00:00:00Z",
};

beforeEach(() => {
  claims.length = 0;
  rpc.mockReset().mockResolvedValue({ data: "ok", error: null });
  invoke.mockReset().mockResolvedValue({ data: { sent: true }, error: null });
  toast.success.mockReset();
  toast.warning.mockReset();
  toast.error.mockReset();
});

describe("BusinessClaimsManager", () => {
  it("approving emails the claimant after the decision is written", async () => {
    claims.push({ ...base, id: "c1", status: "pending" });
    const user = userEvent.setup();
    render(<BusinessClaimsManager />);

    await user.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("review_business_claim", { p_claim_id: "c1", p_approve: true, p_notes: null });
    expect(invoke).toHaveBeenCalledWith("notify-business-claim", { body: { claimId: "c1", decision: "approved" } });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
    expect(toast.success).toHaveBeenCalledWith("Claim approved. The claimant was emailed.");
  });

  it("rejecting sends the rejected mail, and says so when it did not go out", async () => {
    claims.push({ ...base, id: "c2", status: "pending" });
    invoke.mockResolvedValue({ data: { sent: false, reason: "claimant email is not confirmed" }, error: null });
    const user = userEvent.setup();
    render(<BusinessClaimsManager />);

    await user.click(await screen.findByRole("button", { name: /reject/i }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("notify-business-claim", { body: { claimId: "c2", decision: "rejected" } });
    expect(toast.warning.mock.calls[0][0]).toMatch(/did not go out/);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not email when the decision failed", async () => {
    claims.push({ ...base, id: "c3", status: "pending" });
    rpc.mockResolvedValue({ data: null, error: { message: "review_business_claim: not authorized" } });
    const user = userEvent.setup();
    render(<BusinessClaimsManager />);

    await user.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("review_business_claim: not authorized"));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("the verified tab revokes only with a reason, records it and emails the owner", async () => {
    claims.push({ ...base, id: "v1", status: "verified", method: "admin", verified_at: "2026-11-01T00:00:00Z" });
    const user = userEvent.setup();
    render(<BusinessClaimsManager />);

    await user.click(await screen.findByRole("tab", { name: /verified owners/i }));
    const revoke = await screen.findByRole("button", { name: /revoke/i });
    expect(screen.getByText("Zombie Burger")).toBeInTheDocument();
    expect(revoke).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: /reason for removing the owner of zombie burger/i }), "Sold in November");
    expect(revoke).toBeEnabled();
    await user.click(revoke);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("revoke_business_claim", { p_claim_id: "v1", p_reason: "Sold in November" });
    expect(invoke).toHaveBeenCalledWith("notify-business-claim", { body: { claimId: "v1", decision: "revoked" } });
    expect(toast.success).toHaveBeenCalledWith("Owner removed. The claimant was emailed.");
  });
});

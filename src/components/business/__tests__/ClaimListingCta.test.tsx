import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/**
 * The claim button's failure paths. It used to toast the server's text
 * verbatim ("claim_listing: this listing is already claimed", a unique-index
 * name, "Failed to fetch") and keep offering the button on a listing somebody
 * else had already verified.
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

const handleError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/errorHandler", () => ({ handleError }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }) }));

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useBusinessClaim", () => ({
  useBusinessClaim: () => ({ data: null }),
  useClaimListing: () => ({ mutateAsync }),
}));

import { ClaimListingCta } from "@/components/business/ClaimListingCta";
import { ClaimListingError, CLAIM_FAILURE_COPY } from "@/lib/claimFailure";

const renderCta = () =>
  render(
    <MemoryRouter>
      <ClaimListingCta listingType="restaurant" listingId="r1" listingName="Taqueria" />
    </MemoryRouter>,
  );

const press = () => userEvent.click(screen.getByRole("button", { name: "Claim this listing" }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClaimListingCta failures", () => {
  it("an already-claimed listing gets plain copy, no report, and no button to press again", async () => {
    mutateAsync.mockRejectedValue(
      new ClaimListingError({ message: "claim_listing: this listing is already claimed", code: "P0001" }),
    );
    renderCta();
    await press();

    expect(toast.error).toHaveBeenCalledWith(CLAIM_FAILURE_COPY.already_claimed);
    expect(handleError).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Claim this listing" })).not.toBeInTheDocument();
    expect(screen.getByText(/already verified/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact us/i })).toHaveAttribute("href", "/contact");
  });

  it("two owners racing: the unique-index violation reads as already claimed", async () => {
    mutateAsync.mockRejectedValue(
      new ClaimListingError({
        message: 'duplicate key value violates unique constraint "business_claims_one_verified_owner"',
        code: "23505",
      }),
    );
    renderCta();
    await press();

    expect(toast.error).toHaveBeenCalledWith(CLAIM_FAILURE_COPY.already_claimed);
    expect(screen.queryByRole("button", { name: "Claim this listing" })).not.toBeInTheDocument();
  });

  it("a double press that hit this user's own open claim says the claim is in", async () => {
    mutateAsync.mockRejectedValue(
      new ClaimListingError({
        message: 'duplicate key value violates unique constraint "business_claims_one_open_per_user"',
        code: "23505",
      }),
    );
    renderCta();
    await press();

    expect(toast.info).toHaveBeenCalledWith(CLAIM_FAILURE_COPY.own_claim_open);
    expect(toast.error).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("an unexpected failure is reported and shows fixed copy, never the server text", async () => {
    mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    renderCta();
    await press();

    expect(toast.error).toHaveBeenCalledWith(CLAIM_FAILURE_COPY.unknown);
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("Failed to fetch"));
    expect(handleError).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({ component: "ClaimListingCta", action: "claimListing" }),
    );
    // Worth trying again, so the button stays.
    expect(screen.getByRole("button", { name: "Claim this listing" })).toBeInTheDocument();
  });

  it("no toast anywhere carries a raw server prefix", async () => {
    mutateAsync.mockRejectedValue(
      new ClaimListingError({ message: "claim_listing: sign in to claim a listing", code: "P0001" }),
    );
    renderCta();
    await press();

    const shown = [...toast.error.mock.calls, ...toast.info.mock.calls].map((c) => String(c[0]));
    expect(shown).toEqual([CLAIM_FAILURE_COPY.signed_out]);
    expect(shown.some((s) => s.includes("claim_listing:"))).toBe(false);
  });

  it("a missing function still reads as claims opening soon", async () => {
    mutateAsync.mockRejectedValue(
      new ClaimListingError({ message: "Could not find the function public.claim_listing", code: "PGRST202" }),
    );
    renderCta();
    await press();

    expect(toast.info).toHaveBeenCalledWith("Claims open soon. We aren't taking them yet.");
    expect(screen.getByText("Claims open soon.")).toBeInTheDocument();
  });
});

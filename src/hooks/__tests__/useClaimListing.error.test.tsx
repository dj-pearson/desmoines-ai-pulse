import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * useClaimListing has to pass PostgREST's code and details through. The CTA
 * tells "two owners raced" (23505 on one_verified_owner) from "you pressed
 * twice" (23505 on one_open_per_user) by them, and `new Error(error.message)`
 * kept neither.
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { useClaimListing } from "@/hooks/useBusinessClaim";
import { describeClaimFailure } from "@/lib/claimFailure";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useClaimListing errors", () => {
  it("keeps the code, so a racing verified owner reads as already claimed", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "business_claims_one_verified_owner"',
        details: null,
        hint: null,
      },
    });
    const { result } = renderHook(() => useClaimListing(), { wrapper });

    const err = await result.current
      .mutateAsync({ listingType: "restaurant", listingId: "r1" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("23505");
    expect(describeClaimFailure(err).kind).toBe("already_claimed");
  });

  it("an error with no code is unknown, not already claimed", () => {
    expect(describeClaimFailure(new Error("permission denied for function claim_listing")).kind).toBe("unknown");
    expect(describeClaimFailure(null).kind).toBe("unknown");
  });
});

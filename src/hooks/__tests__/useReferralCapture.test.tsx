import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const rpc = vi.fn();
let currentUser: { id: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthState: () => ({ user: currentUser }) }));

import {
  readStoredReferral,
  REFERRAL_STORAGE_KEY,
  REFERRAL_TTL_MS,
  storeReferral,
  useReferralCapture,
} from "@/hooks/useReferralCapture";
import { storage } from "@/lib/safeStorage";

function at(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

describe("useReferralCapture (plan WP6)", () => {
  beforeEach(() => {
    storage.remove(REFERRAL_STORAGE_KEY);
    rpc.mockReset();
    currentUser = null;
  });

  it("stores a well-formed ?ref for an anonymous visitor and sends nothing", () => {
    renderHook(() => useReferralCapture(), { wrapper: at("/events?ref=abcd2345") });
    expect(readStoredReferral()).toBe("ABCD2345");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores a malformed ref", () => {
    renderHook(() => useReferralCapture(), { wrapper: at("/?ref=<script>") });
    expect(readStoredReferral()).toBeNull();
  });

  it("expires after 30 days", () => {
    storeReferral("ABCD2345", 0);
    expect(readStoredReferral(REFERRAL_TTL_MS - 1)).toBe("ABCD2345");
    expect(readStoredReferral(REFERRAL_TTL_MS)).toBeNull();
  });

  it("attributes once after sign-in and clears the code on an answer", async () => {
    storeReferral("ABCD2345");
    currentUser = { id: "u1" };
    rpc.mockResolvedValue({ data: "attributed", error: null });
    const { rerender } = renderHook(() => useReferralCapture(), { wrapper: at("/") });
    await waitFor(() => expect(readStoredReferral()).toBeNull());
    rerender();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("attribute_referral", { p_code: "ABCD2345" });
  });

  it("keeps the code when the RPC errors", async () => {
    storeReferral("ABCD2345");
    currentUser = { id: "u1" };
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    renderHook(() => useReferralCapture(), { wrapper: at("/") });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(readStoredReferral()).toBe("ABCD2345");
  });
});

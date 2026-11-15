import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * WEB-FEAT-085. /admin/tools (EventReviewSystem -> useReviewEvent) looked the
 * submitter's address up with supabase.auth.admin.getUserById from the
 * browser. The anon client cannot call the admin API, the failure was
 * swallowed, and no decision email was ever sent from that screen. Every
 * decision must now invoke notify-event-submission with the submission id
 * (the function reads the recipient from the row and checks the caller).
 */

const h = vi.hoisted(() => {
  const invoke = vi.fn();
  const rpc = vi.fn();
  const getUserById = vi.fn();
  const row = { id: "sub-1", user_id: "owner-1", title: "Jazz in the Park", status: "pending" };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq"]) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: row, error: null }));
  const from = vi.fn(() => chain);
  return { invoke, rpc, getUserById, from };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: h.invoke },
    rpc: h.rpc,
    from: h.from,
    auth: { admin: { getUserById: h.getUserById } },
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-1" } }) }));

import { useReviewEvent } from "@/hooks/useUserSubmittedEvents";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { success: true }, error: null });
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: null, error: null });
  h.getUserById.mockReset();
  h.getUserById.mockRejectedValue(new Error("not allowed from the browser"));
});

const CASES = [
  ["approved", "event_approved"],
  ["rejected", "event_rejected"],
  ["needs_revision", "event_needs_revision"],
] as const;

describe("useReviewEvent notifies the submitter", () => {
  for (const [status, type] of CASES) {
    it(`${status} invokes notify-event-submission with the submission id`, async () => {
      const { result } = renderHook(() => useReviewEvent(), { wrapper });
      const out = await result.current.mutateAsync({ id: "sub-1", status, admin_notes: "See notes" });

      expect(h.invoke).toHaveBeenCalledTimes(1);
      expect(h.invoke).toHaveBeenCalledWith("notify-event-submission", {
        body: { notificationType: type, eventId: "sub-1", adminNotes: "See notes" },
      });
      expect(h.getUserById).not.toHaveBeenCalled();
      expect(out.notified).toBe(true);
    });
  }

  it("reports a failed email without failing the decision", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: "403" } });
    const { result } = renderHook(() => useReviewEvent(), { wrapper });
    const out = await result.current.mutateAsync({ id: "sub-1", status: "rejected" });

    expect(out.notified).toBe(false);
    expect(out.submission.id).toBe("sub-1");
  });

  it("does not notify when publishing an approval fails", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useReviewEvent(), { wrapper });

    await expect(result.current.mutateAsync({ id: "sub-1", status: "approved" })).rejects.toThrow(
      /Publishing the submission failed/,
    );
    expect(h.invoke).not.toHaveBeenCalled();
  });
});

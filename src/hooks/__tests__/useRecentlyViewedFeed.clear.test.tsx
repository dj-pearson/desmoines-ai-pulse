/**
 * WEB-FEAT-043. "Clear all" on the dashboard's Recently viewed card cleared
 * only the local store. A signed-in user's recently_viewed rows stayed on the
 * server, and the next mount merged every one of them back, so the history
 * reappeared on reload and on every other device.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

interface Row {
  content_id: string;
  content_type: string;
  title: string;
  href: string;
  image_url: string | null;
  subtitle: string | null;
  viewed_at: string;
}

let serverRows: Row[] = [];
let releaseSelect: (() => void) | null = null;
let holdSelect = false;
const deleteCalls: Array<{ kind: "eq" | "match"; args: unknown[] }> = [];
let deleteError: { message: string } | null = null;
let currentUser: { id: string } | null = null;

function selectBuilder() {
  const result = () => ({ data: serverRows.slice(), error: null });
  const chain = {
    select: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () =>
      holdSelect
        ? new Promise((resolve) => {
            releaseSelect = () => resolve(result());
          })
        : Promise.resolve(result()),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      ...selectBuilder(),
      delete: () => ({
        eq: (...args: unknown[]) => {
          deleteCalls.push({ kind: "eq", args });
          if (!deleteError) serverRows = [];
          return Promise.resolve({ error: deleteError });
        },
        match: (...args: unknown[]) => {
          deleteCalls.push({ kind: "match", args });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, isAuthenticated: !!currentUser }),
}));

const handleError = vi.fn();
vi.mock("@/lib/errorHandler", () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

import { useRecentlyViewedFeed } from "@/hooks/useRecentlyViewedFeed";
import { clearRecentlyViewed, readRecentlyViewed, recordView } from "@/lib/recentlyViewed";

function row(id: string, minutesAgo = 5): Row {
  return {
    content_id: id,
    content_type: "event",
    title: `Event ${id}`,
    href: `/events/${id}`,
    image_url: null,
    subtitle: null,
    viewed_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

describe("useRecentlyViewedFeed clear (WEB-FEAT-043)", () => {
  beforeEach(() => {
    clearRecentlyViewed();
    serverRows = [];
    holdSelect = false;
    releaseSelect = null;
    deleteCalls.length = 0;
    deleteError = null;
    currentUser = { id: "u1" };
    handleError.mockReset();
  });

  it("deletes the signed-in user's server rows, so a reload does not bring them back", async () => {
    serverRows = [row("a"), row("b")];
    const first = renderHook(() => useRecentlyViewedFeed());
    await waitFor(() => expect(first.result.current.entries).toHaveLength(2));

    act(() => first.result.current.clear());
    expect(first.result.current.entries).toHaveLength(0);
    expect(deleteCalls).toEqual([{ kind: "eq", args: ["user_id", "u1"] }]);
    first.unmount();

    // The next page load: the server is asked again and must have nothing.
    const second = renderHook(() => useRecentlyViewedFeed());
    await waitFor(() => expect(second.result.current.entries).toHaveLength(0));
    expect(readRecentlyViewed()).toHaveLength(0);
  });

  it("drops a server merge that was still in flight when the user cleared", async () => {
    serverRows = [row("a")];
    holdSelect = true;
    const { result } = renderHook(() => useRecentlyViewedFeed());
    await waitFor(() => expect(releaseSelect).not.toBeNull());

    act(() => result.current.clear());
    await act(async () => {
      releaseSelect?.();
      await Promise.resolve();
    });
    expect(result.current.entries).toHaveLength(0);
  });

  it("drops an in-flight merge after a remove, so the removed item does not come back", async () => {
    recordView({ id: "a", type: "event", title: "Event a", href: "/events/a" });
    serverRows = [row("a")];
    holdSelect = true;
    const { result } = renderHook(() => useRecentlyViewedFeed());
    await waitFor(() => expect(releaseSelect).not.toBeNull());

    act(() => result.current.remove("a", "event"));
    await act(async () => {
      releaseSelect?.();
      await Promise.resolve();
    });
    expect(result.current.entries).toHaveLength(0);
  });

  it("reports a failed server delete instead of swallowing it", async () => {
    deleteError = { message: "permission denied" };
    const { result } = renderHook(() => useRecentlyViewedFeed());
    act(() => result.current.clear());
    await waitFor(() => expect(handleError).toHaveBeenCalledTimes(1));
    expect(handleError.mock.calls[0][1]).toEqual({ component: "useRecentlyViewedFeed", action: "clear" });
  });

  it("sends nothing to the server for a guest", () => {
    currentUser = null;
    recordView({ id: "a", type: "event", title: "Event a", href: "/events/a" });
    const { result } = renderHook(() => useRecentlyViewedFeed());
    act(() => result.current.clear());
    expect(deleteCalls).toHaveLength(0);
    expect(readRecentlyViewed()).toHaveLength(0);
  });
});

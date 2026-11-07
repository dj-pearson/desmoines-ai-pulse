import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, act, cleanup } from "@testing-library/react";

/**
 * WEB-PERF-051 - role resolution cost on every page load.
 *
 * The role cache was an in-memory Map, so each reload re-resolved the role, and
 * for a user without a user_roles row (most users) that was three SEQUENTIAL
 * calls: user_roles, then the sync_oauth_user_role RPC - a write - then
 * profiles. Now: the answer is cached in sessionStorage per user, the RPC runs
 * on SIGNED_IN only (once per user per tab), and the two reads run together.
 */

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  authCallback: null as ((event: string, session: unknown) => void) | null,
  initialSession: null as unknown,
  tablesRequested: [] as string[],
  rpcCalls: [] as string[],
  answers: {
    user_roles: { data: [] as unknown[], error: null } as Answer,
    profiles: { data: null, error: null } as Answer,
    rpc: { data: "user", error: null } as Answer,
  },
  // When set, reads are held until released, standing in for a round trip.
  holdReads: false,
  heldReads: [] as Array<() => void>,
}));

function respond(value: Answer): Promise<Answer> {
  if (!h.holdReads) return Promise.resolve(value);
  return new Promise((resolve) => h.heldReads.push(() => resolve(value)));
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: h.initialSession }, error: null })),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        h.authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => ({ error: null })),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        })),
      },
    },
    from: (table: "user_roles" | "profiles") => {
      h.tablesRequested.push(table);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => respond(h.answers[table]);
      chain.then = (ok: (v: Answer) => unknown, bad?: (e: unknown) => unknown) =>
        respond(h.answers[table]).then(ok, bad);
      return chain;
    },
    rpc: vi.fn((name: string) => {
      h.rpcCalls.push(name);
      return respond(h.answers.rpc);
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const ROLE_CACHE_KEY = "auth.roleCache.v1";

const makeUser = (id = "u1", extra: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@b.com`,
  app_metadata: { provider: "google" },
  ...extra,
});
const makeSession = (token: string, user = makeUser()) => ({
  access_token: token,
  expires_at: 1_700_000_000,
  user,
});

interface Seen {
  user: unknown;
  isAdmin: boolean;
  isAdminLoading: boolean;
  logout: (o?: { scope?: "local" | "global" }) => Promise<void>;
}
let seen: Seen[] = [];

function Probe() {
  const { user, isAdmin, isAdminLoading, logout } = useAuth();
  seen.push({ user, isAdmin, isAdminLoading, logout });
  return null;
}

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
}

async function emit(event: string, session: unknown) {
  await act(async () => {
    h.authCallback?.(event, session);
    await Promise.resolve();
  });
  await settle();
}

const last = () => seen[seen.length - 1];

describe("role cache and OAuth link (WEB-PERF-051)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    seen = [];
    h.authCallback = null;
    h.initialSession = null;
    h.tablesRequested = [];
    h.rpcCalls = [];
    h.answers.user_roles = { data: [], error: null };
    h.answers.profiles = { data: null, error: null };
    h.answers.rpc = { data: "user", error: null };
    h.holdReads = false;
    h.heldReads = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    h.heldReads.forEach((release) => release());
    cleanup();
  });

  it("does not call sync_oauth_user_role for a restored session", async () => {
    h.initialSession = makeSession("t1");
    await mount();
    await emit("INITIAL_SESSION", makeSession("t1"));

    expect(h.rpcCalls).toEqual([]);
    expect(last().isAdminLoading).toBe(false);
  });

  it("issues the user_roles and profiles reads together, not one after the other", async () => {
    h.initialSession = makeSession("t1");
    h.holdReads = true;
    await mount();

    // Neither read has answered, and both have been sent.
    expect(h.tablesRequested).toEqual(expect.arrayContaining(["user_roles", "profiles"]));
    expect(last().isAdminLoading).toBe(true);
  });

  it("calls sync_oauth_user_role on SIGNED_IN, once per user per tab", async () => {
    await mount();
    h.answers.rpc = { data: "admin", error: null };

    await emit("SIGNED_IN", makeSession("t1"));
    expect(h.rpcCalls).toEqual(["sync_oauth_user_role"]);
    expect(last().isAdmin).toBe(true);

    // supabase-js re-emits SIGNED_IN on every tab focus. Even past the TTL,
    // when the reads do go out again, the write must not.
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 6 * 60 * 1000);
    await emit("SIGNED_IN", makeSession("t1"));
    expect(h.rpcCalls).toEqual(["sync_oauth_user_role"]);
  });

  it("never calls sync_oauth_user_role on TOKEN_REFRESHED", async () => {
    h.initialSession = makeSession("t1");
    await mount();
    await emit("TOKEN_REFRESHED", makeSession("t2"));
    expect(h.rpcCalls).toEqual([]);
  });

  it("serves a reload from sessionStorage without any role request", async () => {
    h.initialSession = makeSession("t1");
    h.answers.user_roles = { data: [{ role: "admin" }], error: null };
    await mount();
    expect(last().isAdmin).toBe(true);
    cleanup();

    // A reload: fresh provider, same tab storage.
    seen = [];
    h.tablesRequested = [];
    await mount();

    expect(h.tablesRequested).toEqual([]);
    // Admin from the first render that has a user; never a loading state.
    expect(seen.filter((s) => s.user).every((s) => s.isAdmin && !s.isAdminLoading)).toBe(true);
  });

  it("ignores a cached role that belongs to another user", async () => {
    window.sessionStorage.setItem(
      ROLE_CACHE_KEY,
      JSON.stringify({ userId: "someone-else", role: "root_admin", timestamp: Date.now() }),
    );
    h.initialSession = makeSession("t1");
    await mount();

    expect(h.tablesRequested).toContain("user_roles");
    expect(last().isAdmin).toBe(false);
    const stored = JSON.parse(window.sessionStorage.getItem(ROLE_CACHE_KEY) ?? "null");
    expect(stored?.userId).toBe("u1");
  });

  it("ignores a malformed or future-dated cache entry", async () => {
    for (const entry of [
      { userId: "u1", role: "superuser", timestamp: Date.now() },
      { userId: "u1", role: "admin", timestamp: Date.now() + 60 * 60 * 1000 },
    ]) {
      cleanup();
      seen = [];
      h.tablesRequested = [];
      window.sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(entry));
      h.initialSession = makeSession("t1");
      await mount();
      expect(h.tablesRequested).toContain("user_roles");
      expect(last().isAdmin).toBe(false);
    }
  });

  it("clears the cache on sign-out", async () => {
    h.initialSession = makeSession("t1");
    h.answers.user_roles = { data: [{ role: "admin" }], error: null };
    await mount();
    expect(window.sessionStorage.getItem(ROLE_CACHE_KEY)).not.toBeNull();

    await act(async () => {
      await last().logout({ scope: "local" });
    });
    expect(window.sessionStorage.getItem(ROLE_CACHE_KEY)).toBeNull();
  });

  it("clears the cache on a SIGNED_OUT event", async () => {
    h.initialSession = makeSession("t1");
    await mount();
    expect(window.sessionStorage.getItem(ROLE_CACHE_KEY)).not.toBeNull();

    await emit("SIGNED_OUT", null);
    expect(window.sessionStorage.getItem(ROLE_CACHE_KEY)).toBeNull();
  });

  it("does not let a slower read-only check overwrite the OAuth link's answer", async () => {
    // OAuth redirect: getSession resolves the user before supabase-js
    // announces SIGNED_IN, so a read-only check and a linking check overlap.
    h.initialSession = makeSession("t1");
    h.holdReads = true;
    await mount();
    const readOnlyReads = h.heldReads.splice(0);

    h.holdReads = false;
    h.answers.rpc = { data: "admin", error: null };
    await emit("SIGNED_IN", makeSession("t1"));
    expect(h.rpcCalls).toEqual(["sync_oauth_user_role"]);
    expect(last().isAdmin).toBe(true);

    // The read-only check finishes last, with the pre-link answer.
    await act(async () => {
      readOnlyReads.forEach((release) => release());
    });
    await settle();
    expect(last().isAdmin).toBe(true);
    expect(last().isAdminLoading).toBe(false);
  });

  it("keeps the user reference across TOKEN_REFRESHED when the user is unchanged", async () => {
    h.initialSession = makeSession("t1");
    await mount();
    const before = last().user;

    await emit("TOKEN_REFRESHED", makeSession("t2", makeUser()));
    expect(last().user).toBe(before);

    // A real change to the user still comes through.
    await emit("TOKEN_REFRESHED", makeSession("t3", makeUser("u1", { email: "new@b.com" })));
    expect(last().user).not.toBe(before);
    expect((last().user as { email: string }).email).toBe("new@b.com");
  });
});

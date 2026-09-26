import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { type Deps, type PendingNotice, run } from "./handler.ts";

const notice = (id: string, user: string | null = "u1"): PendingNotice => ({
  id,
  campaign_id: "c1",
  recipient_user_id: user,
  notification_type: "campaign_activated",
  title: "Your campaign is live",
  message: "Running now.",
  campaign_name: "Fall Patio Push",
});

function fake(rows: PendingNotice[], opts: { sendOk?: boolean; claimed?: Set<string>; emails?: Record<string, string | null> } = {}) {
  const state = new Map(rows.map((r) => [r.id, true]));
  const sentTo: string[] = [];
  const marked: string[] = [];
  const deps: Deps = {
    listPending: () => Promise.resolve(rows.filter((r) => state.get(r.id))),
    claim: (id) => {
      if (opts.claimed?.has(id) || !state.get(id)) return Promise.resolve(false);
      state.set(id, false);
      return Promise.resolve(true);
    },
    release: (id) => { state.set(id, true); return Promise.resolve(); },
    markSent: (id) => { marked.push(id); return Promise.resolve(); },
    emailFor: (u) => Promise.resolve(opts.emails ? opts.emails[u] ?? null : "ads@example.com"),
    send: (_n, to) => { sentTo.push(to); return Promise.resolve(opts.sendOk ?? true); },
  };
  return { deps, state, sentTo, marked };
}

Deno.test("a pending notice is claimed, sent and marked", async () => {
  const f = fake([notice("n1")]);
  const r = await run(f.deps);
  assertEquals(r, { pending: 1, sent: 1, failed: 0, noAddress: 0, skipped: 0 });
  assertEquals(f.sentTo, ["ads@example.com"]);
  assertEquals(f.marked, ["n1"]);
  assertEquals(f.state.get("n1"), false);
});

Deno.test("a row another run already claimed is not sent again", async () => {
  const f = fake([notice("n1")], { claimed: new Set(["n1"]) });
  const r = await run(f.deps);
  assertEquals(r.skipped, 1);
  assertEquals(f.sentTo, []);
});

Deno.test("a failed send goes back to pending for the next run", async () => {
  const f = fake([notice("n1")], { sendOk: false });
  const r = await run(f.deps);
  assertEquals(r.failed, 1);
  assertEquals(f.state.get("n1"), true);
  assertEquals(f.marked, []);
});

Deno.test("no address clears the row without a send", async () => {
  const f = fake([notice("n1", null), notice("n2", "gone")], { emails: { gone: null } });
  const r = await run(f.deps);
  assertEquals(r.noAddress, 2);
  assertEquals(f.sentTo, []);
  assertEquals(f.state.get("n1"), false);
});

Deno.test("a throwing sender counts as a failure, not a crash", async () => {
  const f = fake([notice("n1")]);
  f.deps.send = () => Promise.reject(new Error("network"));
  const r = await run(f.deps);
  assertEquals(r.failed, 1);
  assertEquals(f.state.get("n1"), true);
});

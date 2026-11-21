import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { renderEmail } from "../../../supabase/functions/_shared/emailLayout.ts";
import { ensureOutreachUnsubscribeToken } from "../../../supabase/functions/_shared/outreachSuppression.ts";

/**
 * AOS-PROSPECT-009, slice 2. Every partnership (outreach) email rendered its
 * footer with preferencesPath "/unsubscribe" and no token, so the opt-out link
 * opened /unsubscribe with nothing to act on and the page said "invalid link";
 * the List-Unsubscribe header carried only the mailto form. The senders now
 * mint the lead's token through ensure_outreach_unsubscribe_token and do not
 * send a step without one.
 */

const TOKEN = "b".repeat(32) + "0123456789abcdef";
const SUPABASE_URL = "https://db.example.test";

// emailLayout reads SUPABASE_URL through globalThis.Deno for the one-click URL.
beforeAll(() => {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (k: string) => (k === "SUPABASE_URL" ? SUPABASE_URL : undefined) },
  };
});

function render(recipient: Parameters<typeof renderEmail>[0]["recipient"]) {
  return renderEmail({ bodyHtml: "<p>hello</p>", bodyText: "hello", recipient, category: "marketing" });
}

describe("emailLayout outreachToken", () => {
  it("links the footer to /unsubscribe?outreach= and the one-click header to email-unsubscribe?outreach=", () => {
    const out = render({ email: "owner@cafe.example", outreachToken: TOKEN });
    expect(out.html).toContain(`/unsubscribe?outreach=${TOKEN}`);
    expect(out.text).toContain(`/unsubscribe?outreach=${TOKEN}`);
    expect(out.listUnsubscribe).toContain(`<${SUPABASE_URL}/functions/v1/email-unsubscribe?outreach=${TOKEN}>`);
    expect(out.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
  });

  it("uses prospect wording, not 'you signed up'", () => {
    const out = render({ email: "owner@cafe.example", outreachToken: TOKEN });
    expect(out.html).toContain("stop these partnership emails in one click");
    expect(out.text).toContain("Stop these partnership emails (one click)");
    expect(out.html).not.toContain("signed up");
    expect(out.text).not.toContain("signed up");
  });

  it("the old outreach recipient (no token) has no one-click header and no token link", () => {
    const out = render({ email: "owner@cafe.example", preferencesPath: "/unsubscribe" });
    expect(out.html).not.toContain("?outreach=");
    expect(out.listUnsubscribePost).toBeUndefined();
  });

  it("an outreach token wins over a newsletter token, so the link stops outreach, not the newsletter", () => {
    const out = render({ email: "owner@cafe.example", outreachToken: TOKEN, unsubscribeToken: "c".repeat(48) });
    expect(out.html).toContain(`?outreach=${TOKEN}`);
    expect(out.html).not.toContain("?token=");
    expect(out.listUnsubscribe).toContain("?outreach=");
  });
});

type Mint = { data?: unknown; error?: string; throws?: boolean };

function client(mint: Mint) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (mint.throws) throw new Error("network down");
      if (mint.error) return { data: null, error: { message: mint.error } };
      return { data: mint.data ?? null, error: null };
    },
  };
}

describe("ensureOutreachUnsubscribeToken", () => {
  it("returns the minted token and asks for the right lead", async () => {
    const c = client({ data: TOKEN });
    expect(await ensureOutreachUnsubscribeToken(c, "lead-1", "t")).toBe(TOKEN);
    expect(c.calls).toEqual([{ fn: "ensure_outreach_unsubscribe_token", args: { p_lead_id: "lead-1" } }]);
  });

  it("answers null (do not send) when the RPC errors, as it does before the migration", async () => {
    const c = client({ error: "Could not find the function public.ensure_outreach_unsubscribe_token" });
    expect(await ensureOutreachUnsubscribeToken(c, "lead-1", "t")).toBeNull();
  });

  it("answers null when the request throws, instead of aborting the batch", async () => {
    expect(await ensureOutreachUnsubscribeToken(client({ throws: true }), "lead-1", "t")).toBeNull();
  });

  it("answers null for a missing or malformed token", async () => {
    expect(await ensureOutreachUnsubscribeToken(client({ data: null }), "lead-1", "t")).toBeNull();
    expect(await ensureOutreachUnsubscribeToken(client({ data: "not-a-token" }), "lead-1", "t")).toBeNull();
    expect(await ensureOutreachUnsubscribeToken(client({ data: TOKEN.toUpperCase() }), "lead-1", "t")).toBeNull();
  });
});

describe("both outreach senders", () => {
  const senders = [
    "supabase/functions/_shared/agents/outreach-sequencer.ts",
    "supabase/functions/agent-outreach/index.ts",
  ];

  for (const file of senders) {
    // Comments stripped so an explanation cannot satisfy a check.
    const src = readFileSync(file, "utf8").replace(/^\s*\/\/[^\n]*$/gm, "");

    it(`${file} mints the token after the quality gate and before the send, and skips without one`, () => {
      const gate = src.indexOf("await scoreOutput(");
      const mint = src.indexOf("await ensureOutreachUnsubscribeToken(supabase, l.id,");
      const guard = src.indexOf("if (!outreachToken) { skipped++; continue; }");
      const render = src.indexOf("renderEmail(");
      const send = src.indexOf("await sendEmail(");
      expect(gate).toBeGreaterThan(-1);
      expect(mint).toBeGreaterThan(gate);
      expect(guard).toBeGreaterThan(mint);
      expect(render).toBeGreaterThan(guard);
      expect(send).toBeGreaterThan(render);
    });

    it(`${file} passes the token to the footer, not the bare /unsubscribe path`, () => {
      expect(src).toContain("recipient: { email, outreachToken }");
      expect(src).not.toContain('preferencesPath: "/unsubscribe"');
    });
  }
});

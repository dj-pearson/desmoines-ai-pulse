import { beforeAll, describe, expect, it } from "vitest";
import type { SendEmailInput, SendEmailResult } from "../../../supabase/functions/_shared/email.ts";

/**
 * WEB-ADS-035. Every nurture email (onboarding, win-back,
 * re-engagement, milestones, subscription nurture, personal digest) said
 * "unsubscribe in one click" and linked to /profile?tab=settings, which needs a
 * sign-in, and its List-Unsubscribe header carried only the mailto form, so no
 * inbox showed a one-click button. No agent passed a token. sendNurtureEmail now
 * looks the recipient's newsletter token up by address, as send-weekly-digest
 * does.
 */

const TOKEN = "a".repeat(32) + "0123456789abcdef";
const SUPABASE_URL = "https://db.example.test";

// emailLayout reads SUPABASE_URL through globalThis.Deno for the one-click URL.
beforeAll(() => {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (k: string) => (k === "SUPABASE_URL" ? SUPABASE_URL : undefined) },
  };
});

type Row = { unsubscribe_token: string | null } | null;

/** The newsletter_subscribers read and the nurture_sends insert, nothing else. */
function fakeClient(opts: { row?: Row; readError?: string; throws?: boolean } = {}) {
  const reads: Array<{ table: string; column: string; value: string }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      if (table === "nurture_sends") {
        return {
          insert(row: Record<string, unknown>) {
            inserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "send-1" }, error: null }) }) };
          },
        };
      }
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            reads.push({ table, column, value });
            return {
              maybeSingle: async () => {
                if (opts.throws) throw new Error("network down");
                if (opts.readError) return { data: null, error: { message: opts.readError } };
                return { data: opts.row ?? null, error: null };
              },
            };
          },
        }),
      };
    },
  };
  return { client: client as unknown as Db, reads, inserts };
}

function capture() {
  const sent: SendEmailInput[] = [];
  const send = async (input: SendEmailInput): Promise<SendEmailResult> => {
    sent.push(input);
    return { ok: true, messageId: "m-1", provider: "ses" };
  };
  return { sent, send };
}

const base = {
  agentKey: "onboarding-drip",
  kind: "onboarding_welcome",
  userId: "u-1",
  email: "  Reader@Example.com ",
  subject: "Welcome",
  bodyHtml: "<p>Hi</p>",
  bodyText: "Hi",
};

async function load() {
  return await import("../../../supabase/functions/_shared/sendNurtureEmail.ts");
}

type Db = Parameters<Awaited<ReturnType<typeof load>>["sendNurtureEmail"]>[0];

describe("sendNurtureEmail unsubscribe token", () => {
  it("gives a subscriber the token footer link and the one-click header", async () => {
    const { sendNurtureEmail } = await load();
    const db = fakeClient({ row: { unsubscribe_token: TOKEN } });
    const out = capture();
    const res = await sendNurtureEmail(db.client, base, { send: out.send });

    expect(res.ok).toBe(true);
    expect(db.reads).toEqual([{ table: "newsletter_subscribers", column: "email", value: "reader@example.com" }]);
    const msg = out.sent[0];
    expect(msg.html).toContain(`/unsubscribe?token=${TOKEN}`);
    expect(msg.text).toContain(`/unsubscribe?token=${TOKEN}`);
    expect(msg.headers?.["List-Unsubscribe"]).toContain(`${SUPABASE_URL}/functions/v1/email-unsubscribe?token=${TOKEN}`);
    expect(msg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("keeps the old footer, and still sends, for an address with no newsletter row", async () => {
    const { sendNurtureEmail } = await load();
    const db = fakeClient({ row: null });
    const out = capture();
    const res = await sendNurtureEmail(db.client, base, { send: out.send });

    expect(res.ok).toBe(true);
    expect(out.sent).toHaveLength(1);
    expect(out.sent[0].html).not.toContain("/unsubscribe?token=");
    expect(out.sent[0].headers?.["List-Unsubscribe-Post"]).toBeUndefined();
  });

  it("sends without the token when the lookup errors or throws", async () => {
    const { sendNurtureEmail } = await load();
    for (const opts of [{ readError: "permission denied" }, { throws: true }]) {
      const db = fakeClient(opts);
      const out = capture();
        const res = await sendNurtureEmail(db.client, base, { send: out.send });
      expect(res.ok).toBe(true);
      expect(out.sent).toHaveLength(1);
      expect(out.sent[0].html).not.toContain("/unsubscribe?token=");
    }
  });

  it("ignores a stored value that is not a well-formed token", async () => {
    const { lookupUnsubscribeToken } = await load();
    for (const bad of ["", "short", TOKEN.toUpperCase(), `${TOKEN}x`, null]) {
      const db = fakeClient({ row: { unsubscribe_token: bad } });
        expect(await lookupUnsubscribeToken(db.client, "a@b.c")).toBeNull();
    }
  });

  it("uses a caller's token as given and does not look one up", async () => {
    const { sendNurtureEmail } = await load();
    const db = fakeClient({ row: { unsubscribe_token: "b".repeat(48) } });
    const out = capture();
    await sendNurtureEmail(db.client, { ...base, unsubscribeToken: TOKEN }, { send: out.send });
    expect(db.reads).toHaveLength(0);
    expect(out.sent[0].html).toContain(`/unsubscribe?token=${TOKEN}`);
  });

  it("does not look a token up for transactional mail", async () => {
    const { sendNurtureEmail } = await load();
    const db = fakeClient({ row: { unsubscribe_token: TOKEN } });
    const out = capture();
    await sendNurtureEmail(db.client, { ...base, category: "transactional" }, { send: out.send });
    expect(db.reads).toHaveLength(0);
    expect(out.sent[0].html).not.toContain("unsubscribe");
    expect(out.sent[0].headers).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  exactIlikePattern,
  findLeadIdsByEmail,
  isOutreachSuppressed,
  outreachSuppressionFilter,
  recordOutreachOptOut,
} from "../../../supabase/functions/_shared/outreachSuppression.ts";

/**
 * AOS-PROSPECT-009. crm_leads.contact_email keeps the lead source's casing,
 * outreach_suppression is written lowercased. The senders compared the two
 * exactly, so an opted-out prospect was mailed again by a lead row spelled
 * "Owner@Biz.com"; outreach-reply looked the lead up exactly too, found none,
 * and returned before it wrote the suppression row.
 *
 * The fake evaluates the three filters these helpers send the way PostgREST
 * does (eq exact, ilike case-insensitive with backslash escapes, or over
 * quoted values), so a filter that would miss in production misses here.
 */

type Row = Record<string, string>;

function unquote(v: string): string {
  return v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v;
}

/** Split a PostgREST or-list on commas outside double quotes. */
function splitOr(list: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "\\" && inQuote) { cur += ch + list[++i]; continue; }
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function ilikeMatches(value: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; }
    if (ch === "%" || ch === "*") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(value);
}

function fakeClient(tables: Record<string, Row[]>, opts: { error?: string } = {}) {
  const inserts: Array<{ table: string; row: Row }> = [];
  const client = {
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = [];
      const q = {
        select: (_columns?: string) => q,
        limit: (_count?: number) => q,
        eq: (col: string, v: string) => { preds.push((r) => r[col] === v); return q; },
        ilike: (col: string, p: string) => { preds.push((r) => ilikeMatches(r[col] ?? "", p)); return q; },
        or: (list: string) => {
          const terms = splitOr(list).map((t) => {
            const [col, op, ...rest] = t.split(".");
            if (op !== "eq") throw new Error(`unsupported op ${op}`);
            return { col, v: unquote(rest.join(".")) };
          });
          preds.push((r) => terms.some((t) => r[t.col] === t.v));
          return q;
        },
        insert: async (row: Row) => { inserts.push({ table, row }); (tables[table] ??= []).push(row); return { error: null }; },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            opts.error
              ? { data: null, error: { message: opts.error } }
              : { data: (tables[table] ?? []).filter((r) => preds.every((p) => p(r))), error: null },
          ).then(resolve),
      };
      return q;
    },
  };
  return { client, inserts };
}

describe("isOutreachSuppressed (AOS-PROSPECT-009)", () => {
  it("catches a mixed-case lead address against the lowercased list", async () => {
    const { client } = fakeClient({ outreach_suppression: [{ id: "s1", email: "owner@biz.com" }] });
    expect(await isOutreachSuppressed(client, "Owner@Biz.com", "t")).toBe(true);
  });

  it("the old exact filter missed the same row (the defect)", async () => {
    const { client } = fakeClient({ outreach_suppression: [{ id: "s1", email: "owner@biz.com" }] });
    const { data, error } = await client.from("outreach_suppression").select("id").or("email.eq.Owner@Biz.com,domain.eq.Biz.com").limit(1) as unknown as { data: Row[]; error: unknown };
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("catches a suppressed domain whatever the lead's casing", async () => {
    const { client } = fakeClient({ outreach_suppression: [{ id: "s2", email: "", domain: "biz.com" }] });
    expect(await isOutreachSuppressed(client, "sales@BIZ.com", "t")).toBe(true);
  });

  it("does not suppress an unrelated address", async () => {
    const { client } = fakeClient({ outreach_suppression: [{ id: "s1", email: "owner@biz.com", domain: "biz.com" }] });
    expect(await isOutreachSuppressed(client, "hello@other.com", "t")).toBe(false);
  });

  it("fails closed when the list cannot be read", async () => {
    const { client } = fakeClient({}, { error: "boom" });
    expect(await isOutreachSuppressed(client, "hello@other.com", "t")).toBe(true);
  });

  it("quotes values so a comma in a scraped address cannot add a filter term", () => {
    expect(outreachSuppressionFilter("A,id.not.is.null@x.com")).toBe('email.eq."a,id.not.is.null@x.com",domain.eq."x.com"');
  });
});

describe("findLeadIdsByEmail (AOS-PROSPECT-009)", () => {
  const leads = [
    { id: "l1", contact_email: "Owner@Biz.com" },
    { id: "l2", contact_email: "owner@biz.com" },
    { id: "l3", contact_email: "ownerxbiz@biz.com" },
    { id: "l4", contact_email: "a_b@x.com" },
    { id: "l5", contact_email: "axb@x.com" },
  ];

  it("finds every lead with the address in any casing", async () => {
    const { client } = fakeClient({ crm_leads: leads });
    expect(await findLeadIdsByEmail(client, "OWNER@biz.com")).toEqual(["l1", "l2"]);
  });

  it("treats _ and % as literal characters", async () => {
    const { client } = fakeClient({ crm_leads: leads });
    expect(await findLeadIdsByEmail(client, "a_b@x.com")).toEqual(["l4"]);
    expect(exactIlikePattern("50%_off@x.com")).toBe("50\\%\\_off@x.com");
  });

  it("falls back to an exact match for an address holding *", async () => {
    const { client } = fakeClient({ crm_leads: [{ id: "l6", contact_email: "a*b@x.com" }, { id: "l7", contact_email: "azzb@x.com" }] });
    expect(exactIlikePattern("a*b@x.com")).toBeNull();
    expect(await findLeadIdsByEmail(client, "a*b@x.com")).toEqual(["l6"]);
  });
});

describe("recordOutreachOptOut (AOS-PROSPECT-009)", () => {
  it("stores the address lowercased, once", async () => {
    const { client, inserts } = fakeClient({ outreach_suppression: [] });
    expect(await recordOutreachOptOut(client, " Owner@Biz.com ", "opt-out reply")).toBe(true);
    expect(await recordOutreachOptOut(client, "owner@biz.com", "opt-out reply")).toBe(false);
    expect(inserts).toEqual([{ table: "outreach_suppression", row: { email: "owner@biz.com", reason: "opt-out reply" } }]);
  });
});

describe("outreach-reply ordering (AOS-PROSPECT-009)", () => {
  const src = readFileSync("supabase/functions/outreach-reply/index.ts", "utf8").replace(/^\s*\/\/[^\n]*$/gm, "");

  it("records an opt-out before it can return 'no matching lead'", () => {
    const record = src.indexOf("recordOutreachOptOut(supabase");
    expect(record).toBeGreaterThan(-1);
    expect(record).toBeLessThan(src.indexOf('note: "no matching lead"'));
  });

  it("looks the lead up case-insensitively and halts every match", () => {
    expect(src).toMatch(/findLeadIdsByEmail\(supabase, email\)/);
    expect(src).toMatch(/update\(\{ outreach_stopped: true \}\)\.in\("id", leadIds\)/);
    expect(src).not.toMatch(/\.eq\("contact_email"/);
  });

  it("both senders use the shared check", () => {
    for (const f of ["supabase/functions/_shared/agents/outreach-sequencer.ts", "supabase/functions/agent-outreach/index.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).toMatch(/isOutreachSuppressed\(supabase, email,/);
      expect(s).not.toMatch(/email\.eq\.\$\{email\}/);
    }
  });
});

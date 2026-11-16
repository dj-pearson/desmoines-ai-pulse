import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-ADS-035 slice 2. Members with no newsletter row get their own one-click
 * marketing unsubscribe token (marketing_unsubscribe_tokens). Anyone holding a
 * token can unsubscribe that member, so the table must never be readable from
 * the browser, and only the service role may mint one. The behaviour was run
 * on a local Postgres 16; these cases pin the lines that made it safe there,
 * because Supabase's default privileges grant anon ALL on a new public table
 * and EXECUTE on a new function unless the migration takes them back.
 */

const FILE = "supabase/migrations/20261108000104_marketing_unsubscribe_tokens.sql";
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");

describe("marketing_unsubscribe_tokens migration (WEB-ADS-035)", () => {
  it("keeps the token table away from anon and authenticated", () => {
    expect(sql).toMatch(/ALTER TABLE public\.marketing_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/REVOKE ALL ON public\.marketing_unsubscribe_tokens FROM PUBLIC, anon, authenticated;/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*marketing_unsubscribe_tokens/i);
  });

  it("lets only the service role mint a token", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.ensure_marketing_unsubscribe_token\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.ensure_marketing_unsubscribe_token\(uuid\) TO ([^;]+);/g)];
    expect(grants.map((m) => m[1].trim())).toEqual(["service_role"]);
  });

  it("grants the unsubscribe RPC to anon, which the edge function and page use", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.marketing_unsubscribe_by_token\(text\) TO anon, authenticated, service_role;/,
    );
  });

  it("writes the same 'unsubscribe' suppression and never downgrades a bounce", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.email_suppressions \(email, reason, source\)\s+VALUES \(v_email, 'unsubscribe', 'account_unsubscribe_token'\)\s+ON CONFLICT \(email\) DO NOTHING;/,
    );
  });

  it("validates the token shape before reading the table", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.marketing_unsubscribe_by_token"));
    expect(fn.indexOf("'^[0-9a-f]{48}$'")).toBeGreaterThan(-1);
    expect(fn.indexOf("'^[0-9a-f]{48}$'")).toBeLessThan(fn.indexOf("FROM public.marketing_unsubscribe_tokens"));
  });

  it("does not create newsletter rows (no signup without double opt-in)", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.newsletter_subscribers/i);
    expect(sql).toMatch(/AND status IN \('active', 'pending'\);/);
  });
});

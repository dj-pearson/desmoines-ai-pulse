import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * AOS-PROSPECT-009 slice 1. Each outreach prospect (crm_leads row) gets a
 * one-click opt-out token. A token unsubscribes its prospect, so the table
 * must never be readable from the browser and only the service role may mint
 * one. The behaviour was run on a local Postgres 16 with Supabase-like default
 * grants; these cases pin the lines that made it safe there.
 */

const FILE = "supabase/migrations/20261115000101_outreach_unsubscribe_tokens.sql";
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");

describe("outreach_unsubscribe_tokens migration (AOS-PROSPECT-009)", () => {
  it("keeps the token table away from anon and authenticated", () => {
    expect(sql).toMatch(/ALTER TABLE public\.outreach_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/REVOKE ALL ON public\.outreach_unsubscribe_tokens FROM PUBLIC, anon, authenticated;/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*outreach_unsubscribe_tokens/i);
  });

  it("lets only the service role mint a token", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.ensure_outreach_unsubscribe_token\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.ensure_outreach_unsubscribe_token\(uuid\) TO ([^;]+);/g)];
    expect(grants.map((m) => m[1].trim())).toEqual(["service_role"]);
  });

  it("grants the opt-out RPC to anon, which the edge function and page use", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.outreach_unsubscribe_by_token\(text\) TO anon, authenticated, service_role;/,
    );
  });

  it("writes what outreach-sequencer checks: a suppression row and outreach_stopped", () => {
    expect(sql).toMatch(/INSERT INTO public\.outreach_suppression \(email, reason\)/);
    expect(sql).toMatch(/UPDATE public\.crm_leads\s+SET outreach_stopped = true/);
  });

  it("validates the token shape before reading the table", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.outreach_unsubscribe_by_token"));
    expect(fn.indexOf("'^[0-9a-f]{48}$'")).toBeGreaterThan(-1);
    expect(fn.indexOf("'^[0-9a-f]{48}$'")).toBeLessThan(fn.indexOf("FROM public.outreach_unsubscribe_tokens"));
  });

  it("stops outreach only, not the newsletter or every marketing email", () => {
    expect(sql).not.toMatch(/email_suppressions/i);
    expect(sql).not.toMatch(/newsletter_subscribers/i);
  });
});

import { describe, it, expect } from "vitest";
import { campaignRpcMessage, readCheckoutFailure, RPC_NOT_AVAILABLE_MESSAGE } from "../campaignCheckout";
import { BUSINESS_CONTACT_EMAIL } from "../businessCopy";

/**
 * Business plan WP0 item 2. Each body below is copied from
 * supabase/functions/create-campaign-checkout/index.ts.
 */
function httpError(status: number, body: unknown): unknown {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: new Response(text, { status, headers: { "Content-Type": "application/json" } }),
  };
}

describe("readCheckoutFailure", () => {
  it("reads the 403 email check", async () => {
    const err = httpError(403, {
      error: "Please verify your email address before paying.",
      code: "email_verification_required",
    });
    expect(await readCheckoutFailure(err)).toEqual({ kind: "verify_email" });
  });

  it("reads the 409 with the server's total", async () => {
    const err = httpError(409, {
      error: "PRICE_CHANGED",
      message: "The price of this campaign has changed since it was created.",
      storedTotal: 70,
      currentTotal: 66.5,
    });
    expect(await readCheckoutFailure(err)).toEqual({ kind: "price_changed", currentTotal: 66.5 });
  });

  it("does not invent a total when the 409 has none", async () => {
    const err = httpError(409, { error: "PRICE_CHANGED", message: "The price changed." });
    expect(await readCheckoutFailure(err)).toEqual({ kind: "error", message: "The price changed." });
  });

  it("reads the 400 for a campaign that can't be paid", async () => {
    const err = httpError(400, { error: "Campaign is not in a payable state" });
    expect(await readCheckoutFailure(err)).toEqual({ kind: "not_payable" });
  });

  it("passes any other server sentence through", async () => {
    const err = httpError(400, { error: "Campaign has no placements" });
    expect(await readCheckoutFailure(err)).toEqual({ kind: "error", message: "Campaign has no placements" });
  });

  it("falls back when the body isn't JSON", async () => {
    const result = await readCheckoutFailure(httpError(502, "<html>Bad gateway</html>"));
    expect(result.kind).toBe("error");
    expect(result).not.toEqual({ kind: "error", message: "" });
  });

  it("never shows supabase-js's generic message", async () => {
    const result = await readCheckoutFailure(new Error("Edge Function returned a non-2xx status code"));
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).not.toMatch(/non-2xx/);
  });

  it("keeps a plain thrown message", async () => {
    expect(await readCheckoutFailure(new Error("Failed to fetch"))).toEqual({
      kind: "error",
      message: "Failed to fetch",
    });
  });
});

describe("campaignRpcMessage", () => {
  it("offers the email fallback for an RPC that isn't applied (by code)", () => {
    expect(campaignRpcMessage({ code: "PGRST202", message: "whatever" })).toBe(RPC_NOT_AVAILABLE_MESSAGE);
    expect(RPC_NOT_AVAILABLE_MESSAGE).toContain(BUSINESS_CONTACT_EMAIL);
  });

  it("recognises PGRST202 by its text after useCampaigns drops the code", () => {
    const err = new Error(
      "Could not find the function public.cancel_campaign(p_campaign_id) in the schema cache",
    );
    expect(campaignRpcMessage(err)).toBe(RPC_NOT_AVAILABLE_MESSAGE);
  });

  it("passes the RPC's own refusal through without its prefix", () => {
    expect(campaignRpcMessage(new Error("cancel_campaign: a active campaign cannot be cancelled here"))).toBe(
      "A active campaign cannot be cancelled here.",
    );
    expect(
      campaignRpcMessage(
        new Error("set_campaign_paused: only an active campaign can be paused (this one is draft)"),
      ),
    ).toBe("Only an active campaign can be paused (this one is draft).");
  });

  it("has something to say for an empty error", () => {
    expect(campaignRpcMessage(null)).toContain(BUSINESS_CONTACT_EMAIL);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { describeAutoReview } from "../creativeReviewVerdict";

/**
 * WEB-ADS-006 AC3. What an advertiser is told after uploading a creative.
 *
 * The message that shipped was "Your ad creative has been submitted for review.
 * You'll be notified when it's approved" - unconditional, and a promise about a
 * function that is not deployed, whose sweep was parked after 4,320 404s a
 * month, and which nothing in src/ referenced. Every one of the four states
 * below produced that same sentence.
 *
 * The direction that must not break is the DEFERRED one: a creative held
 * because a check could not run is not a rejection, and telling an advertiser
 * their ad was rejected when nothing is wrong with it is the failure this
 * separation exists to prevent.
 */

function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

describe("describeAutoReview", () => {
  it("says queued when the review has not answered", () => {
    const v = describeAutoReview({ auto_reviewed: false });
    expect(v.kind).toBe("pending");
    expect(v.variant).toBe("default");
    // This is the ONLY outcome until the function is deployed, so it must not
    // claim the ad was approved or that a verdict is moments away.
    expect(v.description).not.toMatch(/approved/i);
  });

  it("treats a missing row the same as not yet reviewed", () => {
    expect(describeAutoReview(null).kind).toBe("pending");
    expect(describeAutoReview(undefined).kind).toBe("pending");
    expect(describeAutoReview({}).kind).toBe("pending");
  });

  it("reports an approval", () => {
    const v = describeAutoReview({ auto_reviewed: true, is_approved: true });
    expect(v.kind).toBe("approved");
    expect(v.variant).toBe("default");
  });

  it("reports a real failure with what to fix", () => {
    const v = describeAutoReview({
      auto_reviewed: true,
      is_approved: false,
      rejection_reason: "Image 600x90 below 728x90 minimum for top_banner.",
      auto_review_reasons: ["Image 600x90 below 728x90 minimum for top_banner."],
    });
    expect(v.kind).toBe("rejected");
    expect(v.variant).toBe("destructive");
    expect(v.description).toContain("728x90");
  });

  it("does NOT call it a rejection when a check merely could not run", () => {
    // decision.ts leaves rejection_reason NULL in this case on purpose. The
    // advertiser did nothing wrong; ANTHROPIC_API_KEY is not set.
    const v = describeAutoReview({
      auto_reviewed: true,
      is_approved: false,
      rejection_reason: null,
      auto_review_reasons: ["Brand-safety check did not run: skipped (no ANTHROPIC_API_KEY)"],
    });
    expect(v.kind).toBe("deferred");
    expect(v.variant).toBe("default");
    expect(v.description).toMatch(/nothing is wrong/i);
    expect(v.description).not.toMatch(/reject/i);
  });

  it("still explains itself when the deferred row carries no reasons", () => {
    const v = describeAutoReview({ auto_reviewed: true, is_approved: false, auto_review_reasons: [] });
    expect(v.kind).toBe("deferred");
    expect(v.description.length).toBeGreaterThan(20);
  });
});

describe("the form reads the verdict rather than causing it", () => {
  const FORM = codeOnly("src/components/advertising/CreativeUploadForm.tsx");

  it("never invokes campaign-creative-review from the browser", () => {
    // An AFTER INSERT trigger already enqueues it (20260620000006), and the
    // function answers only to an admin JWT, the service role or
    // EDGE_FUNCTION_API_KEY because it does cost-bearing AI work. A browser
    // call would be both a duplicate and a 403.
    expect(FORM).not.toMatch(/campaign-creative-review/);
    expect(FORM).not.toMatch(/functions\.invoke/);
  });

  it("keeps the created row's id so the verdict can be read back", () => {
    expect(FORM).toMatch(/\.select\('id'\)/);
    expect(FORM).toMatch(/pollAutoReview/);
  });

  it("no longer hardcodes the old unconditional promise", () => {
    expect(FORM).not.toMatch(/submitted for review/i);
  });

  it("bounds the wait", () => {
    // A poll with no ceiling holds the advertiser on a spinner forever in the
    // state that is currently permanent - the function is not deployed.
    expect(FORM).toMatch(/REVIEW_POLL_ATTEMPTS/);
    expect(FORM).toMatch(/attempt < REVIEW_POLL_ATTEMPTS/);
  });
});

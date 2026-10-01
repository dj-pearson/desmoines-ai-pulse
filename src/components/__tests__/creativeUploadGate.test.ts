import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-ADS-014 AC3. Only the server may say a campaign has been paid for.
 *
 * stripe-webhook and verify-campaign-payment move a campaign to
 * pending_creative, both after Stripe confirms the money. CreativeUploadForm
 * used to make that move itself - update the row to pending_creative whenever
 * it found one still awaiting payment - so an unpaid advertiser promoted their
 * own campaign by uploading a file, and verify-campaign-payment was left
 * reconciling a state machine that had already moved without it.
 *
 * UploadCreatives made the same mistake in words: it showed "Payment
 * received!" on `pending_payment`, which is precisely the status that means
 * the payment has NOT arrived. A false statement about money, shown to exactly
 * the people it was false for, and the reason they then tried to upload.
 */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

const FORM = codeOnly("src/components/advertising/CreativeUploadForm.tsx");
const PAGE = codeOnly("src/pages/UploadCreatives.tsx");

describe("creative upload is gated on payment", () => {
  it("the form writes no campaign status at all", () => {
    expect(FORM).not.toMatch(/\.update\(\s*\{\s*status:/);
    expect(FORM).not.toContain("'pending_creative'");
  });

  it("the form checks the status before uploading anything", () => {
    const check = FORM.indexOf("UPLOADABLE_STATUSES.includes");
    const upload = FORM.indexOf("uploadToStorage(uploadedFile");
    expect(check, "the gate should exist").toBeGreaterThan(-1);
    // Order matters: a file that reaches the review bucket before the refusal
    // is an object an unpaid campaign put in private storage.
    expect(check).toBeLessThan(upload);
  });

  it("pending_payment is not an uploadable status", () => {
    const list = FORM.match(/const UPLOADABLE_STATUSES = \[([^\]]*)\]/)?.[1] ?? "";
    expect(list).toContain("pending_creative");
    expect(list).not.toContain("pending_payment");
    expect(list).not.toContain("draft");
  });

  it("the page does not tell an unpaid advertiser their payment arrived", () => {
    // The banner for pending_payment must not claim receipt. Checked as an
    // ordering fact rather than by exact wording: whatever the pending_payment
    // branch says, "Payment received" may not be inside it.
    // Either quote style: the page is formatted with double quotes since the
    // business plan (WP2) rewrite.
    const branch = PAGE.search(/campaign\.status === ["']pending_payment["']/);
    expect(branch).toBeGreaterThan(-1);
    const nextBranch = PAGE.indexOf("campaign.status ===", branch + 10);
    const body = PAGE.slice(branch, nextBranch === -1 ? branch + 600 : nextBranch);
    expect(body).not.toMatch(/payment received/i);
  });
});

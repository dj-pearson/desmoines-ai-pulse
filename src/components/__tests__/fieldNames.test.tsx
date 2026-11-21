import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068. A placeholder is not a label. scripts/check-field-names.mjs
 * ratchets text fields and selects with no accessible name across
 * src/components and src/pages. These cases pin what the scanner flags and
 * what it lets through, and the reader-facing fields fixed in this slice
 * (NewsletterSignup's hero/modal/default forms, the /social group planner,
 * the promotion planner's share link) stay named.
 */
const scan = (source: string): number[] => findUnnamedFields(source, "fixture.tsx");

describe("findUnnamedFields", () => {
  it("flags placeholder-only fields and bare selects", () => {
    expect(scan(`<Input placeholder="your@email.com" value={v} />`)).toEqual([1]);
    expect(scan(`<Textarea placeholder="Notes..." />`)).toEqual([1]);
    expect(scan(`<input type="text" />`)).toEqual([1]);
    expect(scan(`<Select>\n  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>\n</Select>`)).toEqual([2]);
  });

  it("flags a Label that is not tied to the field", () => {
    expect(scan(`<div><Label>CPM rate</Label><Input type="number" /></div>`)).toEqual([1]);
    expect(scan(`<div><Label htmlFor="a">A</Label><Input id="b" /></div>`)).toEqual([1]);
  });

  it("accepts every way a field can be named", () => {
    expect(scan(`<Input aria-label="Email address" />`)).toEqual([]);
    expect(scan(`<Textarea aria-labelledby={headingId} />`)).toEqual([]);
    expect(scan(`<Input title="Search" />`)).toEqual([]);
    expect(scan(`<div><Label htmlFor="email">Email</Label><Input id="email" /></div>`)).toEqual([]);
    expect(scan(`<div><Label htmlFor={id}>Email</Label><Input id={id} /></div>`)).toEqual([]);
    expect(scan(`<label>Email <input type="email" /></label>`)).toEqual([]);
    expect(scan(`<FormItem><FormLabel>Budget</FormLabel><FormControl><SelectTrigger /></FormControl></FormItem>`)).toEqual([]);
  });

  it("gives the benefit of the doubt where the name may come from elsewhere", () => {
    expect(scan(`<Input {...field} />`)).toEqual([]);
    expect(scan(`<Input id={props.id} />`)).toEqual([]);
    expect(scan(`<input type="hidden" name="x" />`)).toEqual([]);
    expect(scan(`<input type="file" className="hidden" />`)).toEqual([]);
    expect(scan(`<input type="checkbox" />`)).toEqual([]);
  });

  it("keeps the fixed reader-facing files at zero", () => {
    for (const file of [
      "src/components/NewsletterSignup.tsx",
      "src/components/EnhancedGroupPlanner.tsx",
      "src/components/event-promotion-planner/SocialShare.tsx",
    ]) {
      const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
      expect(findUnnamedFields(source, file), file).toEqual([]);
    }
  });
});

vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe: vi.fn(), loading: false }),
}));

describe("NewsletterSignup fields have names", () => {
  it.each(["default", "modal"] as const)("%s variant labels first name and email", async (variant) => {
    const { NewsletterSignup } = await import("@/components/NewsletterSignup");
    render(<NewsletterSignup variant={variant} />);
    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("First name (optional)").getAttribute("autocomplete")).toBe("given-name");
  });

  it("hero variant names its email field", async () => {
    const { NewsletterSignup } = await import("@/components/NewsletterSignup");
    render(<NewsletterSignup variant="hero" />);
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeTruthy();
  });
});

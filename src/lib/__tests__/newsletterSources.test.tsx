import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NEWSLETTER_SOURCES } from "@/lib/newsletterSources";

/**
 * WEB-ADS-033. Every on-site newsletter form except the footer sent source
 * 'website', so /admin's Source column could not say which form signed a
 * reader up: the end of an article, the visitors guide, the confirm page's
 * retry form and the reminder notice all read the same.
 *
 * These cases pin three things: each placement names itself, the edge
 * function accepts every name the client sends (it stores 'website' for an
 * unknown one, which would put the column back where it was without an
 * error), and the form passes the source through to the hook.
 */

const subscribe = vi.fn();
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe, loading: false }),
}));

const { NewsletterSignup } = await import("@/components/NewsletterSignup");
const { ReminderEmailsUnsubscribedNotice } = await import("@/components/ReminderEmailsUnsubscribedNotice");

beforeEach(() => subscribe.mockReset());

function serverSources(): string[] {
  const src = readFileSync("supabase/functions/newsletter-subscribe/index.ts", "utf8");
  const m = src.match(/const ALLOWED_SOURCES = \[([\s\S]*?)\];/);
  expect(m, "ALLOWED_SOURCES literal in newsletter-subscribe").toBeTruthy();
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Each on-site placement and the source it must send. */
const PLACEMENTS: Array<[file: string, pattern: RegExp]> = [
  ["src/pages/ArticleDetails.tsx", /<NewsletterSignup[^>]*source="article"/],
  ["src/pages/VisitorsGuide.tsx", /<NewsletterSignup[^>]*source="visitors_guide"/],
  ["src/pages/NewsletterConfirm.tsx", /<NewsletterSignup[^>]*source="confirm_page"/],
  ["src/components/Footer.tsx", /subscribe\(\{[^}]*source: "footer"/],
];

describe("newsletter signup sources", () => {
  it("the edge function accepts exactly the sources the client can send", () => {
    expect([...serverSources()].sort()).toEqual([...NEWSLETTER_SOURCES].sort());
  });

  it("no value the server already stored was dropped from the list", () => {
    // Older rows carry these; removing one would orphan them.
    for (const v of ["website", "popup", "footer", "checkout", "hero"]) {
      expect(NEWSLETTER_SOURCES).toContain(v);
    }
  });

  it.each(PLACEMENTS)("%s names its own form", (file, pattern) => {
    expect(readFileSync(file, "utf8")).toMatch(pattern);
  });

  it("no rendered NewsletterSignup in src/pages passes the catch-all 'website'", () => {
    for (const [file] of PLACEMENTS) {
      expect(readFileSync(file, "utf8")).not.toMatch(/<NewsletterSignup[^>]*source="website"/);
    }
  });

  it("the form sends the source it was given", async () => {
    subscribe.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<NewsletterSignup variant="compact" source="visitors_guide" />);
    await user.type(screen.getByPlaceholderText(/email/i), "reader@example.com");
    await user.keyboard("{Enter}");
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ source: "visitors_guide" }));
  });

  it("the reminder notice's resubscribe is recorded as the reminder notice", async () => {
    subscribe.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ReminderEmailsUnsubscribedNotice email="reader@example.com" />);
    await user.click(screen.getByRole("button", { name: "Resubscribe" }));
    expect(subscribe).toHaveBeenCalledWith({ email: "reader@example.com", source: "reminder_notice" });
  });
});

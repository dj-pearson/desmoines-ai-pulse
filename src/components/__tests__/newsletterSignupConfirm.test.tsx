import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-ADS-017. After a submit, newsletter-subscribe leaves the row 'pending'
 * until the emailed link is clicked, but the form said "You're In! Welcome to
 * the Des Moines Insider community" while the toast from the same submit said
 * "Almost there". The heading was the wrong one: a reader who believes they're
 * subscribed doesn't go and click the link, and never gets the weekly email.
 *
 * The copy also has to be the same for every outcome, because the function
 * answers one sentence for new, pending, unsubscribed and already-active
 * addresses (and mails nobody who is already active). The hook can't tell the
 * component which case it was, and this test keeps it that way.
 */
const subscribe = vi.fn();
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe, loading: false }),
}));

const { NewsletterSignup } = await import("@/components/NewsletterSignup");

const VARIANTS = ["default", "compact", "hero", "footer", "modal"] as const;

beforeEach(() => {
  subscribe.mockReset();
});

async function submit(variant: (typeof VARIANTS)[number]) {
  const user = userEvent.setup();
  render(<NewsletterSignup variant={variant} />);
  const field = screen.getByPlaceholderText(/email/i);
  await user.type(field, "reader@example.com");
  await user.keyboard("{Enter}");
  return user;
}

describe("NewsletterSignup after a successful submit", () => {
  it.each(VARIANTS)("%s variant asks for the confirmation click", async (variant) => {
    subscribe.mockResolvedValue(true);
    await submit(variant);

    const status = await screen.findByRole("status");
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeTruthy();
    expect(status.textContent).toMatch(/confirmation link/i);
    expect(status.textContent).toMatch(/click it/i);
  });

  it("does not announce a subscription that hasn't been confirmed", async () => {
    subscribe.mockResolvedValue(true);
    await submit("default");

    const status = await screen.findByRole("status");
    expect(status.textContent).not.toMatch(/you're in/i);
    expect(status.textContent).not.toMatch(/welcome/i);
    // No per-case wording: nothing here may say whether the address was
    // already on the list.
    expect(status.textContent).not.toMatch(/already/i);
  });

  it("keeps the form when the submit fails", async () => {
    subscribe.mockResolvedValue(false);
    await submit("default");

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
  });

  it("lets the reader go back to the form", async () => {
    subscribe.mockResolvedValue(true);
    const user = await submit("compact");

    await user.click(await screen.findByRole("button", { name: /subscribe another email/i }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
  });
});

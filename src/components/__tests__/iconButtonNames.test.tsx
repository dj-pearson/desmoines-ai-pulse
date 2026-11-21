import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * WEB-UX-055. EventFeedback renders three icon-only buttons on every event
 * card a signed-in reader sees. They had no accessible name and no pressed
 * state, so a screen reader announced "button, button, button" with nothing
 * saying which was like, dislike or interested, or which one was already on.
 * The footer newsletter form had the same gap: a Mail icon as the only
 * content of its submit button and a placeholder as the only label.
 */
const feedbackState: { current: { feedback_type: string } | null } = { current: null };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/hooks/useFeedback", () => ({
  useFeedback: () => ({
    submitFeedback: vi.fn(),
    removeFeedback: vi.fn(),
    getFeedbackForEvent: () => feedbackState.current,
    getFeedbackStats: vi.fn().mockResolvedValue({
      thumbs_up: 0,
      thumbs_down: 0,
      interested: 0,
      not_interested: 0,
    }),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe: vi.fn(), loading: false }),
}));

const { default: EventFeedback } = await import("@/components/EventFeedback");
const { NewsletterSignup } = await import("@/components/NewsletterSignup");

describe("EventFeedback buttons", () => {
  beforeEach(() => {
    feedbackState.current = null;
  });

  it("names each button after the event and starts unpressed", () => {
    render(<EventFeedback eventId="e1" itemName="Jazz Night" />);
    for (const name of ["Interested in Jazz Night", "Like Jazz Night", "Dislike Jazz Night"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("reports the current rating through aria-pressed", () => {
    feedbackState.current = { feedback_type: "thumbs_down" };
    render(<EventFeedback eventId="e1" itemName="Jazz Night" />);
    expect(screen.getByRole("button", { name: "Dislike Jazz Night" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Like Jazz Night" })).toHaveAttribute("aria-pressed", "false");
  });

  it("falls back to a generic name without a title", () => {
    render(<EventFeedback eventId="e1" />);
    expect(screen.getByRole("button", { name: "Like this event" })).toBeTruthy();
  });
});

describe("NewsletterSignup footer variant", () => {
  it("labels the email field and the icon-only submit", () => {
    render(<NewsletterSignup variant="footer" />);
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeTruthy();
  });
});

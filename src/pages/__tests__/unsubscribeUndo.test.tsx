/**
 * WEB-ADS-023: a reader who unsubscribed by mistake (or whose forwarded digest
 * a colleague clicked) had no way back from /unsubscribe but "Back to home".
 * The newsletter link's success and already states now offer a compact signup,
 * which goes through newsletter-subscribe's double opt-in. States where the
 * newsletter was not touched, or where nothing happened, do not offer it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const rpc = vi.fn();
const subscribe = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const client = {
    rest: {},
    rpc(this: unknown, ...a: unknown[]) {
      if (this !== client) throw new TypeError("detached rpc");
      return rpc(...a);
    },
  };
  return { supabase: client };
});
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/lib/consentLog", () => ({ logConsent: vi.fn() }));
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe, loading: false }),
}));

import Unsubscribe from "@/pages/Unsubscribe";
import { NEWSLETTER_CONFIRM_BODY } from "@/content/newsletterCopy";

const TOKEN = "a".repeat(48);

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Unsubscribe />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const undoHeading = () => screen.queryByRole("heading", { name: /unsubscribed by mistake/i });
const emailBox = () => screen.queryByRole("textbox", { name: /email address/i });

beforeEach(() => {
  rpc.mockReset();
  subscribe.mockReset();
});

describe("/unsubscribe way back (WEB-ADS-023)", () => {
  it.each([
    ["success", { success: true, already_unsubscribed: false }, /You've been unsubscribed/],
    ["already", { success: true, already_unsubscribed: true }, /already unsubscribed/],
  ])("the newsletter link's %s state offers a resubscribe form", async (_s, row, text) => {
    rpc.mockResolvedValue({ data: [row], error: null });
    renderAt(`/unsubscribe?token=${TOKEN}`);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(undoHeading()).toBeInTheDocument();
    expect(emailBox()).toBeInTheDocument();
    expect(screen.getByText(/send a confirmation link/i)).toBeInTheDocument();
  });

  it("the form starts a double opt-in recorded as the unsubscribe page, and says a link comes first", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_unsubscribed: false }], error: null });
    subscribe.mockResolvedValue(true);
    const user = userEvent.setup();
    renderAt(`/unsubscribe?token=${TOKEN}`);

    await user.type(await screen.findByRole("textbox", { name: /email address/i }), "reader@example.com");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ email: "reader@example.com", source: "unsubscribe_page" }),
    );
    expect(await screen.findByText(NEWSLETTER_CONFIRM_BODY)).toBeInTheDocument();
    // Only the newsletter RPC ran; the page itself never reactivates anyone.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid token", { data: [{ success: false }], error: null }, /invalid or has expired/],
    ["RPC error", { data: null, error: { message: "boom" } }, /Something went wrong/],
  ])("a newsletter link that failed (%s) does not offer it", async (_s, answer, text) => {
    rpc.mockResolvedValue(answer);
    renderAt(`/unsubscribe?token=${TOKEN}`);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(undoHeading()).not.toBeInTheDocument();
    expect(emailBox()).not.toBeInTheDocument();
  });

  it("a missing token does not offer it", async () => {
    renderAt("/unsubscribe");
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(undoHeading()).not.toBeInTheDocument();
  });

  it.each([
    ["account", `account=${TOKEN}`, { success: true, already_unsubscribed: false }, /You've been unsubscribed/],
    ["outreach", `outreach=${TOKEN}`, { success: true, already_unsubscribed: false }, /partnership emails/],
  ])("an %s link does not offer the newsletter form", async (_s, query, row, text) => {
    rpc.mockResolvedValue({ data: [row], error: null });
    renderAt(`/unsubscribe?${query}`);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(undoHeading()).not.toBeInTheDocument();
    expect(emailBox()).not.toBeInTheDocument();
  });
});

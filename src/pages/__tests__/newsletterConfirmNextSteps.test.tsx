/**
 * WEB-ADS-031: /newsletter/confirm used to end at "Back to
 * home" in every state. A confirmed reader now gets something to read today
 * (and a free-account offer when signed out); a reader holding a spent link
 * gets a form for a fresh one instead of "sign up again from any page".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const rpc = vi.fn();
const flags = { isAuthenticated: false };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuthFlags: () => flags }));
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe: vi.fn(), loading: false }),
}));

import NewsletterConfirm from "@/pages/NewsletterConfirm";

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <NewsletterConfirm />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function nextSteps() {
  return within(await screen.findByRole("navigation", { name: /don't want to wait/i }));
}

describe("NewsletterConfirm next steps", () => {
  beforeEach(() => {
    rpc.mockReset();
    flags.isAuthenticated = false;
  });

  it.each([
    ["success", { success: true, already_confirmed: false }],
    ["already", { success: true, already_confirmed: true }],
  ])("%s links to this weekend, today and open-now", async (_state, row) => {
    rpc.mockResolvedValue({ data: [row], error: null });
    renderAt("/newsletter/confirm?token=t0k");

    const nav = await nextSteps();
    const hrefs = nav.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/events/this-weekend", "/events/today", "/restaurants/open-now"]),
    );
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
  });

  it("offers a free account only to a signed-out reader", async () => {
    rpc.mockResolvedValue({ data: [{ success: true }], error: null });
    const { unmount } = renderAt("/newsletter/confirm?token=t0k");
    const nav = await nextSteps();
    expect(nav.getByRole("link", { name: /create a free account/i })).toHaveAttribute(
      "href",
      "/auth?mode=signup",
    );
    unmount();

    flags.isAuthenticated = true;
    renderAt("/newsletter/confirm?token=t0k");
    const signedIn = await nextSteps();
    expect(signedIn.queryByRole("link", { name: /create a free account/i })).not.toBeInTheDocument();
  });

  it("a spent link shows a form for a fresh one and no next steps", async () => {
    rpc.mockResolvedValue({ data: [{ success: false }], error: null });
    renderAt("/newsletter/confirm?token=t0k");

    expect(await screen.findByText(/no longer valid/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /get a new confirmation link/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email address/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /don't want to wait/i })).not.toBeInTheDocument();
  });

  it("a missing token is invalid too and gets the same form", async () => {
    renderAt("/newsletter/confirm");
    expect(await screen.findByRole("textbox", { name: /email address/i })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an error shows neither the form nor next steps", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    renderAt("/newsletter/confirm?token=t0k");

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email address/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /don't want to wait/i })).not.toBeInTheDocument();
  });
});

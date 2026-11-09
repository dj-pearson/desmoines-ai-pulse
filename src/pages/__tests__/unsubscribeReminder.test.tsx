/**
 * WEB-FEAT-059: an event-reminder email links to /unsubscribe?reminder=<id>.
 * That must cancel the reminders for that event through
 * cancel_event_reminders_by_token, and must never run the newsletter
 * unsubscribe, which also suppresses every other marketing email.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

const rpc = vi.fn();
const handleError = vi.fn();
const logConsent = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  // rpc reads this.rest in supabase-js, so the stub fails a detached call too.
  const client = {
    rest: {},
    rpc(this: unknown, ...a: unknown[]) {
      if (this !== client) throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      return rpc(...a);
    },
  };
  return { supabase: client };
});
vi.mock("@/lib/errorHandler", () => ({
  handleError: (...a: unknown[]) => handleError(...a),
}));
vi.mock("@/lib/consentLog", () => ({ logConsent: (...a: unknown[]) => logConsent(...a) }));

import Unsubscribe from "@/pages/Unsubscribe";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Unsubscribe />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("/unsubscribe?reminder= (WEB-FEAT-059)", () => {
  beforeEach(() => {
    rpc.mockReset();
    handleError.mockReset();
    logConsent.mockReset();
  });

  it("cancels that event's reminders and leaves the newsletter alone", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, cancelled: 2, event_title: "Jazz in July" }], error: null });
    renderAt(`/unsubscribe?reminder=${ID}`);

    expect(await screen.findByText(/Reminders for Jazz in July are off/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cancel_event_reminders_by_token", { p_token: ID });
    expect(screen.getByRole("link", { name: "See your reminders" })).toHaveAttribute("href", "/my-events?tab=reminders");
    // Not a newsletter opt-out, so no newsletter consent withdrawal is logged.
    expect(logConsent).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("a second click (nothing left to cancel) still reads as done", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, cancelled: 0, event_title: null }], error: null });
    renderAt(`/unsubscribe?reminder=${ID}`);

    expect(await screen.findByText(/Reminders for this event are off/)).toBeInTheDocument();
  });

  it("an unknown id is an invalid link", async () => {
    rpc.mockResolvedValue({ data: [{ success: false, cancelled: 0, event_title: null }], error: null });
    renderAt(`/unsubscribe?reminder=${ID}`);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("an RPC error shows fixed copy and goes to handleError", async () => {
    const error = { message: "Could not find the function (PGRST202)", code: "PGRST202" };
    rpc.mockResolvedValue({ data: null, error });
    renderAt(`/unsubscribe?reminder=${ID}`);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("PGRST202");
    expect(handleError).toHaveBeenCalledWith(error, { component: "Unsubscribe", action: "cancelRemindersByToken" });
  });

  it("an empty reminder param is invalid without a request", async () => {
    renderAt("/unsubscribe?reminder=");

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

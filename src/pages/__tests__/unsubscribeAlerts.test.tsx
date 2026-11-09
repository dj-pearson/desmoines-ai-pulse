/**
 * WEB-FEAT-073: a saved-search alert email links to
 * /unsubscribe?alerts=<saved search id>. That must turn off event alerts
 * through disable_event_alerts_by_token, and must never run the newsletter
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

const ID = "7a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Unsubscribe />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("/unsubscribe?alerts= (WEB-FEAT-073)", () => {
  beforeEach(() => {
    rpc.mockReset();
    handleError.mockReset();
    logConsent.mockReset();
  });

  it("turns off saved-search alerts and leaves the newsletter alone", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_disabled: false }], error: null });
    renderAt(`/unsubscribe?alerts=${ID}`);

    expect(await screen.findByText(/Saved-search alerts are off/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("disable_event_alerts_by_token", { p_token: ID });
    expect(screen.getByRole("link", { name: "Manage saved searches" })).toHaveAttribute(
      "href",
      "/dashboard?tab=saved-searches",
    );
    // Not a newsletter opt-out, so no newsletter consent withdrawal is logged.
    expect(logConsent).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("a second click still reads as done", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_disabled: true }], error: null });
    renderAt(`/unsubscribe?alerts=${ID}`);

    expect(await screen.findByText(/Saved-search alerts are off/)).toBeInTheDocument();
  });

  it("an unknown id is an invalid link", async () => {
    rpc.mockResolvedValue({ data: [{ success: false, already_disabled: false }], error: null });
    renderAt(`/unsubscribe?alerts=${ID}`);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("an RPC error shows fixed copy and goes to handleError", async () => {
    const error = { message: "Could not find the function (PGRST202)", code: "PGRST202" };
    rpc.mockResolvedValue({ data: null, error });
    renderAt(`/unsubscribe?alerts=${ID}`);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("PGRST202");
    expect(handleError).toHaveBeenCalledWith(error, { component: "Unsubscribe", action: "disableAlertsByToken" });
  });

  it("an empty alerts param is invalid without a request", async () => {
    renderAt("/unsubscribe?alerts=");

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

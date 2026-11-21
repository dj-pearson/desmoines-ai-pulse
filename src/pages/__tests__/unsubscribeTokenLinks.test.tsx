/**
 * email-unsubscribe's GET 303s an ?account= link (WEB-ADS-035) and an
 * ?outreach= link (AOS-PROSPECT-009) to /unsubscribe. The page must run the
 * matching RPC, never the newsletter one, instead of reading the missing
 * ?token= as "invalid or expired".
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

beforeEach(() => {
  rpc.mockReset();
  handleError.mockReset();
  logConsent.mockReset();
});

describe("/unsubscribe?account= (WEB-ADS-035)", () => {
  it("unsubscribes a member through their account token and logs the withdrawal", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_unsubscribed: false }], error: null });
    renderAt(`/unsubscribe?account=${TOKEN}`);

    expect(await screen.findByText(/You've been unsubscribed/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("marketing_unsubscribe_by_token", { p_token: TOKEN });
    expect(logConsent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "marketing_email", granted: false, source: "unsubscribe_page" }),
    );
    expect(handleError).not.toHaveBeenCalled();
  });

  it("a second click reads as already unsubscribed and logs nothing", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_unsubscribed: true }], error: null });
    renderAt(`/unsubscribe?account=${TOKEN}`);

    expect(await screen.findByText(/already unsubscribed/)).toBeInTheDocument();
    expect(logConsent).not.toHaveBeenCalled();
  });

  it("an unknown token is an invalid link", async () => {
    rpc.mockResolvedValue({ data: [{ success: false, already_unsubscribed: false }], error: null });
    renderAt(`/unsubscribe?account=${TOKEN}`);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("an RPC error shows fixed copy and goes to handleError", async () => {
    const error = { message: "Could not find the function (PGRST202)", code: "PGRST202" };
    rpc.mockResolvedValue({ data: null, error });
    renderAt(`/unsubscribe?account=${TOKEN}`);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("PGRST202");
    expect(handleError).toHaveBeenCalledWith(error, {
      component: "Unsubscribe",
      action: "unsubscribeAccountByToken",
    });
  });
});

describe("/unsubscribe?outreach= (AOS-PROSPECT-009)", () => {
  it("stops partnership email only: no newsletter RPC, no consent row", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_unsubscribed: false }], error: null });
    renderAt(`/unsubscribe?outreach=${TOKEN}`);

    expect(await screen.findByText(/any more partnership emails/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("outreach_unsubscribe_by_token", { p_token: TOKEN });
    expect(logConsent).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });

  it("a repeat click says it was already done", async () => {
    rpc.mockResolvedValue({ data: [{ success: true, already_unsubscribed: true }], error: null });
    renderAt(`/unsubscribe?outreach=${TOKEN}`);

    expect(await screen.findByText(/already stopped our partnership emails/)).toBeInTheDocument();
  });

  it("an unknown token is an invalid link", async () => {
    rpc.mockResolvedValue({ data: [{ success: false, already_unsubscribed: false }], error: null });
    renderAt(`/unsubscribe?outreach=${TOKEN}`);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it("a thrown request shows fixed copy and goes to handleError", async () => {
    const error = new TypeError("Failed to fetch");
    rpc.mockRejectedValue(error);
    renderAt(`/unsubscribe?outreach=${TOKEN}`);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Failed to fetch");
    expect(handleError).toHaveBeenCalledWith(error, {
      component: "Unsubscribe",
      action: "unsubscribeOutreachByToken",
    });
  });

  it("an empty outreach param is invalid without a request", async () => {
    renderAt("/unsubscribe?outreach=");

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});

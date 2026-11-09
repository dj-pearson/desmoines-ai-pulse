/**
 * WEB-ADS-024: the newsletter confirm and unsubscribe pages used to print the
 * RPC's error.message inside the alert ("Something went wrong (...)"), so a
 * reader saw PostgREST internals and ops saw nothing. Both failure paths (an
 * error answer and a thrown request) must show fixed copy and report through
 * handleError instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { ComponentType } from "react";

const rpc = vi.fn();
const handleError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock("@/lib/errorHandler", () => ({
  handleError: (...a: unknown[]) => handleError(...a),
}));
vi.mock("@/lib/consentLog", () => ({ logConsent: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuthFlags: () => ({ isAuthenticated: false }) }));
vi.mock("@/hooks/useNewsletterSubscription", () => ({
  useNewsletterSubscription: () => ({ subscribe: vi.fn(), loading: false }),
}));

import NewsletterConfirm from "@/pages/NewsletterConfirm";
import Unsubscribe from "@/pages/Unsubscribe";

const RAW = 'permission denied for function newsletter_x (code 42501, PGRST202)';

function renderAt(Page: ComponentType, url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Page />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

const pages: Array<[string, ComponentType, string, string, string]> = [
  ["NewsletterConfirm", NewsletterConfirm, "/newsletter/confirm?token=t0k", "confirmByToken", "newsletter_confirm_by_token"],
  ["Unsubscribe", Unsubscribe, "/unsubscribe?token=t0k", "unsubscribeByToken", "newsletter_unsubscribe_by_token"],
];

describe.each(pages)("%s error states (WEB-ADS-024)", (name, Page, url, action, rpcName) => {
  beforeEach(() => {
    rpc.mockReset();
    handleError.mockReset();
  });

  it("an RPC error answer shows fixed copy and goes to handleError", async () => {
    const error = { message: RAW, code: "42501" };
    rpc.mockResolvedValue({ data: null, error });
    renderAt(Page, url);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(rpcName, { p_token: "t0k" });
    expect(document.body.textContent).not.toContain(RAW);
    expect(document.body.textContent).not.toContain("42501");
    expect(handleError).toHaveBeenCalledWith(error, { component: name, action });
  });

  it("a thrown request shows fixed copy and goes to handleError", async () => {
    const thrown = new Error(RAW);
    rpc.mockRejectedValue(thrown);
    renderAt(Page, url);

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(RAW);
    expect(handleError).toHaveBeenCalledWith(thrown, { component: name, action });
  });

  it("a successful answer reports nothing", async () => {
    rpc.mockResolvedValue({ data: [{ success: true }], error: null });
    renderAt(Page, url);

    expect(await screen.findByText(/confirmed|unsubscribed/i)).toBeInTheDocument();
    expect(handleError).not.toHaveBeenCalled();
  });
});

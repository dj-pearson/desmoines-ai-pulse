/**
 * WEB-FEAT-065. Event reminders are marketing mail and follow the newsletter
 * unsubscribe (owner decision on WEB-FEAT-063). A reader whose address has an
 * 'unsubscribe' suppression could turn a reminder on, be told "You'll receive
 * a reminder", and get nothing. The card must say they won't be emailed and
 * offer the resubscribe that lifts the suppression.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const invoke = vi.fn();
const toast = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  // rpc reads this.rest in supabase-js, so the stub fails a detached call too.
  const client = {
    rest: {},
    rpc(this: unknown, ...a: unknown[]) {
      if (this !== client) throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      return rpc(...a);
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  };
  return { supabase: client };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "reader@example.com" }, isAuthenticated: true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EventReminderSettings } from "@/components/EventReminderSettings";

type RpcAnswer = { data: unknown; error: unknown };

function backend(unsubscribed: RpcAnswer, reminders: Record<string, boolean> = { "1_day": true }) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "get_user_reminders_for_event") {
      return Promise.resolve({ data: { authenticated: true, reminders }, error: null });
    }
    if (fn === "my_reminder_emails_unsubscribed") return Promise.resolve(unsubscribed);
    if (fn === "toggle_event_reminder") return Promise.resolve({ data: { success: true }, error: null });
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
  });
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/events/e1"]}>
        <EventReminderSettings eventId="e1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOTICE = /we won't email these reminders/i;

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  toast.mockReset();
});

describe("EventReminderSettings when reminder emails are unsubscribed (WEB-FEAT-065)", () => {
  it("says reminders won't be emailed and drops the 'We'll send you' promise", async () => {
    backend({ data: true, error: null });
    renderCard();

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(/We'll send you email reminders/)).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("my_reminder_emails_unsubscribed");
  });

  it("resubscribes the signed-in address through newsletter-subscribe", async () => {
    backend({ data: true, error: null });
    invoke.mockResolvedValue({ data: { message: "Check your inbox" }, error: null });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Resubscribe" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const [fnName, opts] = invoke.mock.calls[0] as [string, { body: { email: string } }];
    expect(fnName).toBe("newsletter-subscribe");
    expect(opts.body.email).toBe("reader@example.com");
    expect(await screen.findByText(/Reminders start once you click it/)).toBeInTheDocument();
  });

  it("toasts that a newly set reminder will not be emailed", async () => {
    backend({ data: true, error: null }, {});
    renderCard();
    await screen.findByText(NOTICE);

    fireEvent.click(screen.getByRole("checkbox", { name: /3 hours before/ }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reminder saved, but not emailed" }));
  });

  it("shows no notice when the address is not suppressed", async () => {
    backend({ data: false, error: null });
    renderCard();

    expect(await screen.findByText(/We'll send you email reminders/)).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("my_reminder_emails_unsubscribed"));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("toasts the ordinary confirmation when not suppressed", async () => {
    backend({ data: false, error: null }, {});
    renderCard();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("my_reminder_emails_unsubscribed"));

    fireEvent.click(await screen.findByRole("checkbox", { name: /3 hours before/ }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reminder enabled" }));
  });

  it("shows no notice while the RPC is not applied yet (PGRST202)", async () => {
    backend({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    renderCard();

    expect(await screen.findByText(/We'll send you email reminders/)).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("my_reminder_emails_unsubscribed"));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

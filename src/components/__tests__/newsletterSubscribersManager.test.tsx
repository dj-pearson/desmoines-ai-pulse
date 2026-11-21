import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

/**
 * WEB-ADS-029. The admin subscriber list predated double opt-in: a 'pending'
 * row (signed up, never clicked the confirmation link) showed as
 * "Unsubscribed" and had a Re-subscribe button that wrote status = 'active'.
 * send-newsletter-campaign mails every active row, so one admin click mailed an
 * address nobody had confirmed. The same button overrode explicit opt-outs, and
 * the bulk Unsubscribe rewrote bounced rows.
 */

type Row = {
  id: string;
  email: string;
  first_name: string | null;
  source: string | null;
  status: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

function row(id: string, email: string, status: string): Row {
  return {
    id,
    email,
    first_name: null,
    source: "footer",
    status,
    subscribed_at: "2026-11-01T12:00:00Z",
    unsubscribed_at: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  };
}

const ROWS: Row[] = [
  row("a", "active@example.com", "active"),
  row("p", "pending@example.com", "pending"),
  row("u", "gone@example.com", "unsubscribed"),
  row("b", "bounced@example.com", "bounced"),
];

type Call = { method: string; args: unknown[] };
const writes: Call[][] = [];

/** A PostgREST builder that records its chain; reads answer ROWS, writes answer the active ids. */
function builder() {
  const calls: Call[] = [];
  let isWrite = false;
  const self: Record<string, unknown> = {};
  for (const method of ["select", "ilike", "eq", "order", "range", "limit", "in", "update"]) {
    self[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "update") {
        isWrite = true;
        writes.push(calls);
      }
      return self;
    };
  }
  self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const value = isWrite
      ? { data: [{ id: "a" }], error: null }
      : { data: ROWS, error: null, count: ROWS.length };
    return Promise.resolve(value).then(resolve, reject);
  };
  return self;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => builder() },
}));
vi.mock("@/lib/adminAudit", () => ({ recordAdminAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import NewsletterSubscribersManager from "@/components/admin/NewsletterSubscribersManager";

function rowFor(email: string): HTMLElement {
  const cell = screen.getByText(email);
  const tr = cell.closest("tr");
  if (!tr) throw new Error(`no row for ${email}`);
  return tr as HTMLElement;
}

describe("NewsletterSubscribersManager (WEB-ADS-029)", () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it("labels a pending row as awaiting confirmation, not unsubscribed", async () => {
    render(<NewsletterSubscribersManager />);
    await screen.findByText("pending@example.com");
    const pending = rowFor("pending@example.com");
    expect(within(pending).getByText("Awaiting confirmation")).toBeInTheDocument();
    expect(within(pending).queryByText("Unsubscribed")).not.toBeInTheDocument();
  });

  it("offers no way to put a pending, unsubscribed or bounced address back on the list", async () => {
    render(<NewsletterSubscribersManager />);
    await screen.findByText("pending@example.com");
    expect(screen.queryByTitle(/re-subscribe/i)).not.toBeInTheDocument();
    for (const email of ["pending@example.com", "gone@example.com", "bounced@example.com"]) {
      const tr = rowFor(email);
      // The only button left in the row would be the row action; the checkbox is role=checkbox.
      expect(within(tr).queryAllByRole("button")).toHaveLength(0);
    }
  });

  it("unsubscribes an active row, scoped to rows that are still active", async () => {
    render(<NewsletterSubscribersManager />);
    await screen.findByText("active@example.com");
    fireEvent.click(within(rowFor("active@example.com")).getByRole("button", { name: "Unsubscribe active@example.com" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    const chain = writes[0];
    const update = chain.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "unsubscribed" });
    expect(chain).toContainEqual({ method: "in", args: ["id", ["a"]] });
    expect(chain).toContainEqual({ method: "eq", args: ["status", "active"] });
  });

  it("never writes status active from a pending row's actions", async () => {
    render(<NewsletterSubscribersManager />);
    await screen.findByText("pending@example.com");
    for (const button of within(rowFor("pending@example.com")).queryAllByRole("button")) {
      fireEvent.click(button);
    }
    // Let any write the click started reach the mock.
    await new Promise((r) => setTimeout(r, 50));
    const activations = writes.filter((chain) =>
      chain.some((c) => c.method === "update" && (c.args[0] as { status?: string }).status === "active"),
    );
    expect(activations).toHaveLength(0);
  });
});

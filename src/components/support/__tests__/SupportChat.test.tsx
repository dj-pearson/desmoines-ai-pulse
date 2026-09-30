import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * When support-chat fails (it was listed undeployed in edge-deploy-baseline),
 * every message, "Talk to a human" included, ended in "use the contact form"
 * with no way to get there. The failure now links to /contact, and the form is
 * reachable from the chat whether or not anything failed.
 */

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));

import SupportChat from "@/components/support/SupportChat";

function renderChat() {
  return render(
    <MemoryRouter>
      <SupportChat />
    </MemoryRouter>,
  );
}

const contactLinks = () =>
  screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/contact");

describe("SupportChat", () => {
  beforeEach(() => {
    invoke.mockReset();
    // jsdom has no Element.scrollTo; the chat scrolls its log on every message.
    Element.prototype.scrollTo = vi.fn();
  });

  it("always offers the contact form", () => {
    renderChat();
    expect(contactLinks()).toHaveLength(1);
  });

  it("links to the contact form when the assistant is unreachable", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Function not found") });
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /talk to a human/i }));
    await waitFor(() => expect(screen.getByText("Open the contact form")).toBeTruthy());
    expect(contactLinks()).toHaveLength(2);
  });

  it("does not show the failure link on a normal reply", async () => {
    invoke.mockResolvedValue({ data: { reply: "Here is how." }, error: null });
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /reset my password/i }));
    await waitFor(() => expect(screen.getByText("Here is how.")).toBeTruthy());
    expect(screen.queryByText("Open the contact form")).toBeNull();
  });
});

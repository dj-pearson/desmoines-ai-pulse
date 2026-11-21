import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * AOS-PROSPECT-007 AC3: marking a deal won set onboarding_started and pinged
 * ops, and nothing on the board got the business into /advertise. A won card
 * now copies the funnel link with the account's listing preselected.
 */

const ID = "0b7f3c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b";
const board = vi.fn();
vi.mock("@/hooks/useCrm", () => ({
  CRM_STAGES: ["new", "qualified", "contacted", "proposal", "won", "lost"],
  useCrmBoard: () => board(),
  useCrmAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProposal: () => ({ generate: { mutateAsync: vi.fn(), isPending: false }, openProposal: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "closer-1" } }) }));
const handleError = vi.fn();
vi.mock("@/lib/errorHandler", () => ({ handleError: (...args: unknown[]) => handleError(...args) }));
const success = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => success(...a), error: vi.fn() } }));

import CrmBoard from "@/components/admin/CrmBoard";

function opp(id: string, stage: string, account_id: string) {
  return {
    id, name: `${id} deal`, stage, value: 0, next_action: null, suggested_next_action: null,
    assigned_closer: "closer-1", onboarding_started: stage === "won", account_id, campaign_id: null,
    closed_at: null, updated_at: "2026-11-16T00:00:00Z",
  };
}

const ACCOUNTS = [
  { id: "a1", name: "Zombie Burger", category: null, city: null, website: null, business_ref: `restaurants:${ID}`, advertiser_user_id: null },
  { id: "a2", name: "Hand Entered Co", category: null, city: null, website: null, business_ref: null, advertiser_user_id: null },
  { id: "a3", name: "Still Talking", category: null, city: null, website: null, business_ref: `restaurants:${ID}`, advertiser_user_id: null },
];

const writeText = vi.fn();

// userEvent.setup() installs its own clipboard stub, so ours goes on after it.
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return user;
}

beforeEach(() => {
  writeText.mockReset();
  success.mockReset();
  handleError.mockReset();
  board.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      leads: [],
      accounts: ACCOUNTS,
      proposals: [],
      opportunities: [opp("o1", "won", "a1"), opp("o2", "won", "a2"), opp("o3", "proposal", "a3")],
    },
  });
});

describe("CrmBoard onboarding link", () => {
  it("is offered on won deals only", () => {
    render(<CrmBoard />);
    expect(screen.getAllByRole("button", { name: /copy onboarding link/i })).toHaveLength(2);
  });

  it("copies /advertise with the account's listing preselected", async () => {
    writeText.mockResolvedValue(undefined);
    const user = setupUser();
    render(<CrmBoard />);
    await user.click(screen.getAllByRole("button", { name: /copy onboarding link/i })[0]);
    const copied = new URL(writeText.mock.calls[0][0] as string);
    expect(copied.pathname).toBe("/advertise");
    expect(copied.searchParams.get("listing_type")).toBe("restaurant");
    expect(copied.searchParams.get("listing_id")).toBe(ID);
    expect(success).toHaveBeenLastCalledWith(expect.stringMatching(/listing preselected/));
  });

  it("copies the bare funnel link when the account has no listing", async () => {
    writeText.mockResolvedValue(undefined);
    const user = setupUser();
    render(<CrmBoard />);
    await user.click(screen.getAllByRole("button", { name: /copy onboarding link/i })[1]);
    const copied = new URL(writeText.mock.calls[0][0] as string);
    expect(copied.pathname).toBe("/advertise");
    expect(copied.searchParams.has("listing_id")).toBe(false);
    expect(success).toHaveBeenCalledWith("Onboarding link copied.");
  });

  it("shows the link to copy by hand when the clipboard is refused", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    const user = setupUser();
    render(<CrmBoard />);
    await user.click(screen.getAllByRole("button", { name: /copy onboarding link/i })[0]);
    expect(handleError).toHaveBeenCalledWith(expect.any(Error), { component: "CrmBoard", action: "copy_onboarding_link" });
    expect(prompt).toHaveBeenCalledWith(expect.any(String), expect.stringContaining(`listing_id=${ID}`));
    prompt.mockRestore();
  });
});

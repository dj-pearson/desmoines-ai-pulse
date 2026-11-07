import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-ADS-020. The invite card offered only "Copy link", so on a phone a
 * member had to copy, leave for a messaging app and paste. Where the browser
 * has a share sheet the card now offers it, and the three outcomes behave
 * differently on purpose:
 *   shared       nothing else happens
 *   cancelled    nothing else happens; the clipboard is not overwritten
 *   unavailable  falls back to copying the link
 */
vi.mock("@/hooks/useReferralStats", () => ({
  useReferralStats: () => ({ data: { referralCode: "ABCD2345", signedUp: 0, subscribed: 0 } }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { InviteFriendsCard } = await import("@/components/account/InviteFriendsCard");

const LINK = "https://desmoinesinsider.com/?ref=ABCD2345";
const writeText = vi.fn<(text: string) => Promise<void>>();

function setShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "share", { value: fn, configurable: true, writable: true });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  toast.mockReset();
});

afterEach(() => {
  setShare(undefined);
});

/** userEvent.setup() installs its own clipboard; ours goes on top of it. */
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return user;
}

describe("InviteFriendsCard share", () => {
  it("offers no Share button where the browser has no share sheet", () => {
    setShare(undefined);
    render(<InviteFriendsCard />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("opens the share sheet with the invite link and leaves the clipboard alone", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    setShare(share);
    render(<InviteFriendsCard />);
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].url).toBe(LINK);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not copy when the member closes the sheet", async () => {
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    setShare(share);
    render(<InviteFriendsCard />);
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("copies the link when the sheet cannot open", async () => {
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    setShare(share);
    render(<InviteFriendsCard />);
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
});

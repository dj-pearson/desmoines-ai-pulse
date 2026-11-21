import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-UX-052: forum and thread rows on /social were divs with onClick and no
 * tab stop, so a keyboard user could not open either. Opening one also
 * unmounted the focused control and dropped focus on <body>.
 */

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const thread = {
  id: "t1",
  forum_id: "f1",
  title: "Best patio for a Friday",
  content: "Looking for ideas",
  is_pinned: true,
  is_locked: false,
  created_at: "2026-11-01T18:00:00Z",
};

vi.mock("@/hooks/useCommunityFeatures", () => ({
  useCommunityFeatures: () => ({
    forums: [
      {
        id: "f1",
        title: "Food and drink",
        description: "Where to eat",
        category: "general",
        created_at: "2026-10-01T18:00:00Z",
      },
      {
        id: "f2",
        title: "Live music",
        description: null,
        category: "general",
        created_at: "2026-10-02T18:00:00Z",
      },
    ],
    createForum: vi.fn(),
    getThreads: vi.fn().mockResolvedValue([thread]),
    createThread: vi.fn(),
    getReplies: vi.fn().mockResolvedValue([]),
    createReply: vi.fn(),
  }),
}));

import { CommunityForums } from "@/components/CommunityForums";

describe("CommunityForums keyboard access (WEB-UX-052)", () => {
  it("opens a forum and a thread from the keyboard and keeps focus on the page", async () => {
    const user = userEvent.setup();
    render(<CommunityForums />);

    const forumButton = screen.getByRole("button", { name: "Food and drink" });
    forumButton.focus();
    await user.keyboard("{Enter}");

    const forumHeading = await screen.findByRole("heading", { name: "Food and drink" });
    expect(forumHeading).toHaveFocus();

    const threadButton = await screen.findByRole("button", { name: "Best patio for a Friday" });
    threadButton.focus();
    await user.keyboard(" ");

    const threadHeading = await screen.findByRole("heading", { name: /Best patio for a Friday/ });
    expect(threadHeading).toHaveFocus();
    expect(screen.getByRole("img", { name: "Pinned" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to Food and drink/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Best patio for a Friday" })).toHaveFocus()
    );

    await user.click(screen.getByRole("button", { name: /Back to Forums/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Food and drink" })).toHaveFocus()
    );
  });

  it("gives every forum row a real tab stop", async () => {
    const user = userEvent.setup();
    render(<CommunityForums />);

    await user.tab(); // New Forum
    await user.tab();
    expect(screen.getByRole("button", { name: "Food and drink" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Live music" })).toHaveFocus();
  });
});

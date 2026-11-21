import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-UX-053: the Create Forum and Create Thread dialogs on /social put a bare
 * <label> beside each field with no htmlFor, and the reply box had no label at
 * all, so a screen reader announced only the placeholder (WCAG 1.3.1 / 4.1.2).
 */

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

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
    ],
    createForum: vi.fn(),
    getThreads: vi.fn().mockResolvedValue([
      {
        id: "t1",
        forum_id: "f1",
        title: "Best patio for a Friday",
        content: "Looking for ideas",
        is_pinned: false,
        is_locked: false,
        created_at: "2026-11-01T18:00:00Z",
      },
    ]),
    createThread: vi.fn(),
    getReplies: vi.fn().mockResolvedValue([]),
    createReply: vi.fn(),
  }),
}));

import { CommunityForums } from "@/components/CommunityForums";

describe("CommunityForums field labels (WEB-UX-053)", () => {
  it("names both fields of the Create Forum dialog", async () => {
    const user = userEvent.setup();
    render(<CommunityForums />);

    await user.click(screen.getByRole("button", { name: /New Forum/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create New Forum" });

    const title = screen.getByLabelText("Title");
    const description = screen.getByLabelText("Description");
    expect(dialog).toContainElement(title);
    expect(title.tagName).toBe("INPUT");
    expect(description.tagName).toBe("TEXTAREA");
  });

  it("names both fields of the Create Thread dialog and the reply box", async () => {
    const user = userEvent.setup();
    render(<CommunityForums />);

    await user.click(screen.getByRole("button", { name: "Food and drink" }));
    await user.click(await screen.findByRole("button", { name: /New Thread/ }));
    await screen.findByRole("dialog", { name: "Create New Thread" });

    expect(screen.getByLabelText("Title").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Content").tagName).toBe("TEXTAREA");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Best patio for a Friday" }));

    const reply = await screen.findByRole("textbox", { name: "Your reply" });
    expect(reply.tagName).toBe("TEXTAREA");
  });
});

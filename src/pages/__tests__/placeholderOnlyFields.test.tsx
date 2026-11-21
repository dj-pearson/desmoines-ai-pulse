import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-UX-065: the /csat comment box and the /social "Enter friend's email"
 * field were named only by their placeholder, which disappears as soon as
 * someone types. Each now has a visible label tied to the control, so
 * getByLabelText finds it (it does not match on placeholder text).
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: () => undefined }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useSocialFeatures", () => ({
  useSocialFeatures: () => ({
    friends: [],
    friendGroups: [],
    groupsAvailable: false,
    sendFriendRequest: vi.fn(),
    error: null,
    fetchFriends: vi.fn(),
  }),
}));
vi.mock("@/components/GroupEventPlannerSimple", () => ({ GroupEventPlanner: () => null }));
vi.mock("@/components/CommunityForums", () => ({ CommunityForums: () => null }));
vi.mock("@/components/TrendingContent", () => ({ default: () => null }));
vi.mock("@/components/EnhancedGroupPlanner", () => ({ EnhancedGroupPlanner: () => null }));

import Csat from "@/pages/Csat";
import Social from "@/pages/Social";

describe("fields named only by placeholder (WEB-UX-065)", () => {
  it("labels the /csat comment box, and the name survives typing", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/csat?ticket=t1"]}>
        <Csat />
      </MemoryRouter>
    );

    const comment = screen.getByLabelText(/comments/i);
    expect(comment.tagName).toBe("TEXTAREA");
    await user.type(comment, "Quick reply, thanks");
    expect(screen.getByRole("textbox", { name: /comments/i })).toHaveValue("Quick reply, thanks");
  });

  it("labels the /social friend email field as an email input", () => {
    render(
      <MemoryRouter>
        <Social />
      </MemoryRouter>
    );

    const email = screen.getByLabelText(/friend's email/i);
    expect(email.tagName).toBe("INPUT");
    expect(email).toHaveAttribute("type", "email");
    expect(screen.getByRole("textbox", { name: /friend's email/i })).toBe(email);
  });
});

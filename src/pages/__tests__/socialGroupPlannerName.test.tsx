import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-UX-054: /social passed groupName="Selected Group" to the planner whatever
 * group was picked, so its heading and share text never named the group.
 */

interface MockGroup {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
}

const state: { groups: MockGroup[] } = { groups: [] };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: () => undefined }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useSocialFeatures", () => ({
  useSocialFeatures: () => ({
    friends: [],
    friendGroups: state.groups,
    groupsAvailable: true,
    sendFriendRequest: vi.fn(),
    error: null,
    fetchFriends: vi.fn(),
  }),
}));
vi.mock("@/components/GroupEventPlannerSimple", () => ({ GroupEventPlanner: () => null }));
vi.mock("@/components/CommunityForums", () => ({ CommunityForums: () => null }));
vi.mock("@/components/TrendingContent", () => ({ default: () => null }));
vi.mock("@/components/EnhancedGroupPlanner", () => ({
  EnhancedGroupPlanner: ({ groupId, groupName }: { groupId: string; groupName: string }) => (
    <h2 data-testid="planner" data-group-id={groupId}>
      {groupName}
    </h2>
  ),
}));

import Social from "@/pages/Social";

const renderSocial = () =>
  render(
    <MemoryRouter>
      <Social />
    </MemoryRouter>
  );

describe("Social group planner title (WEB-UX-054)", () => {
  beforeEach(() => {
    state.groups = [
      { id: "g1", name: "Friday Crew", description: "Weekend plans", is_public: false },
      { id: "g2", name: "Book Club", description: "Monthly", is_public: true },
    ];
  });

  it("titles the planner with the picked group's name", async () => {
    const user = userEvent.setup();
    renderSocial();

    await user.click(screen.getByRole("tab", { name: "Groups" }));
    await user.click(screen.getByText("Book Club"));

    const planner = screen.getByTestId("planner");
    expect(planner).toHaveTextContent("Book Club");
    expect(planner).toHaveAttribute("data-group-id", "g2");
    expect(screen.queryByText("Selected Group")).not.toBeInTheDocument();
  });

  it("closes the planner when the picked group leaves the list", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSocial();

    await user.click(screen.getByRole("tab", { name: "Groups" }));
    await user.click(screen.getByText("Friday Crew"));
    expect(screen.getByTestId("planner")).toHaveTextContent("Friday Crew");

    state.groups = state.groups.filter((group) => group.id !== "g1");
    rerender(
      <MemoryRouter>
        <Social />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("planner")).not.toBeInTheDocument();
  });
});

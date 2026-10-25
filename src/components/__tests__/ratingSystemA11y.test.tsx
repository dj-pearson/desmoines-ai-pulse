import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const ratingsState = {
  ratings: [] as Array<Record<string, unknown>>,
};

vi.mock("@/hooks/useRatings", () => ({
  useRatings: () => ({
    ratings: ratingsState.ratings,
    userRating: null,
    aggregate: null,
    isLoading: false,
    submitRating: async () => true,
    deleteRating: async () => true,
    voteHelpful: async () => true,
    reportReview: async () => true,
  }),
  useUserReputation: () => ({ reputation: null }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/capacitorUtils", () => ({ hapticTap: () => {} }));

import { RatingSystem } from "@/components/RatingSystem";

function renderSystem() {
  return render(
    <MemoryRouter>
      <RatingSystem contentType="restaurant" contentId="r1" />
    </MemoryRouter>,
  );
}

/**
 * The review form's labels had no htmlFor, the photo picker was an icon in a
 * label with no text, and the photo lightbox was an unnamed dialog.
 */
describe("RatingSystem form accessibility", () => {
  it("labels the review textarea, the star group and the photo picker", async () => {
    const user = userEvent.setup();
    renderSystem();
    await user.click(screen.getByRole("button", { name: /Rate this restaurant/ }));

    expect(screen.getByLabelText("Review (Optional)").tagName).toBe("TEXTAREA");

    const stars = screen.getByRole("radiogroup", { name: "Your Rating" });
    expect(stars).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5 stars" })).toHaveAttribute("aria-checked", "true");

    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker).toHaveAccessibleName("Add photos");
  });

  it("names the review photo lightbox", async () => {
    const user = userEvent.setup();
    ratingsState.ratings = [
      {
        id: "rv1",
        user_id: "u2",
        rating: "4",
        review_text: "Good noodles",
        photo_urls: ["https://example.test/p.jpg"],
        created_at: "2026-10-01T12:00:00Z",
        profiles: null,
      },
    ];
    renderSystem();
    await user.click(screen.getByRole("button", { name: "View review photo" }));
    expect(await screen.findByRole("dialog", { name: "Review photo" })).toBeInTheDocument();
    ratingsState.ratings = [];
  });
});

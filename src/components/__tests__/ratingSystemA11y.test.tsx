import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const ratingsState = {
  ratings: [] as Array<Record<string, unknown>>,
  reputations: {} as Record<string, { level: string; points: number }>,
  error: null as string | null,
  refetch: vi.fn(),
  aggregate: null as null | { total_ratings: number; weighted_average: number; rating_distribution: Record<string, number> },
};
const authState = { user: { id: "u1" } as { id: string } | null };

vi.mock("@/hooks/useRatings", () => ({
  useRatings: () => ({
    ratings: ratingsState.ratings,
    userRating: null,
    aggregate: ratingsState.aggregate,
    reputations: ratingsState.reputations,
    isLoading: false,
    error: ratingsState.error,
    refetch: ratingsState.refetch,
    submitRating: async () => true,
    deleteRating: async () => true,
    voteHelpful: async () => true,
    reportReview: async () => true,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/components/PremiumGate", () => ({
  PremiumGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { RatingSystem } from "@/components/RatingSystem";

function renderSystem(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

describe("RatingSystem load states", () => {
  it("shows an error with a retry instead of 'No ratings yet' when the load fails", async () => {
    const user = userEvent.setup();
    ratingsState.error = "Failed to fetch";
    renderSystem();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No ratings yet")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(ratingsState.refetch).toHaveBeenCalled();
    ratingsState.error = null;
  });

  it("shows each reviewer's badge from the batched reputations", () => {
    ratingsState.ratings = [
      { id: "rv1", user_id: "u2", rating: "4", review_text: "Good", photo_urls: [], created_at: "2026-10-01T12:00:00Z", profiles: null },
      { id: "rv2", user_id: "u3", rating: "5", review_text: "Great", photo_urls: [], created_at: "2026-10-02T12:00:00Z", profiles: null },
    ];
    ratingsState.reputations = { u2: { level: "expert", points: 120 } };
    renderSystem();
    expect(screen.getByText("EXPERT (120 pts)")).toBeInTheDocument();
    expect(screen.getAllByText(/pts\)/)).toHaveLength(1);
    ratingsState.ratings = [];
    ratingsState.reputations = {};
  });

  it("sends a guest to sign in with a redirect back to this page", () => {
    authState.user = null;
    renderSystem("/restaurants/some-place?tab=menu");
    expect(screen.getByRole("link", { name: "Sign in to review" })).toHaveAttribute(
      "href",
      `/auth?redirect=${encodeURIComponent("/restaurants/some-place?tab=menu")}`,
    );
    authState.user = { id: "u1" };
  });
});

/**
 * WEB-SEO-079. With nothing rated the block was a full card of "No ratings
 * yet" / "Be the first to rate!" plus a sign-in panel, on nearly every
 * restaurant page. It is one line now, and the full card returns with a rating.
 */
describe("RatingSystem empty state", () => {
  it("is one line with the sign-in link when nothing is rated", () => {
    authState.user = null;
    const { container } = renderSystem("/restaurants/some-place");
    expect(screen.getByText("No ratings yet.")).toBeInTheDocument();
    expect(screen.queryByText("User Ratings")).not.toBeInTheDocument();
    expect(screen.queryByText(/Be the first to rate/)).not.toBeInTheDocument();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe("P");
    expect(screen.getByRole("link", { name: "Sign in to review" })).toBeInTheDocument();
    authState.user = { id: "u1" };
  });

  it("shows the full card and the count once there is a rating", () => {
    ratingsState.aggregate = { total_ratings: 2, weighted_average: 4.5, rating_distribution: { "5": 1, "4": 1 } };
    renderSystem();
    expect(screen.getByText("User Ratings")).toBeInTheDocument();
    expect(screen.getByText("Based on 2 reviews")).toBeInTheDocument();
    expect(screen.queryByText("No ratings yet.")).not.toBeInTheDocument();
    ratingsState.aggregate = null;
  });
});

/**
 * WEB-PERF-041. Review photos are stored at up to 1280px / 500KB and were
 * raw <img> tags in 96px boxes, so every thumbnail downloaded the stored
 * original. They now ask the render endpoint for a box-sized rendition.
 */
describe("RatingSystem review photo sizing", () => {
  const PHOTO = "https://abc.supabase.co/storage/v1/object/public/review-photos/u2/p.jpg";
  const RENDER = "/storage/v1/render/image/public/review-photos/u2/p.jpg";

  it("requests 96px-box renditions for thumbnails and viewport-sized ones in the lightbox", async () => {
    const user = userEvent.setup();
    ratingsState.ratings = [
      {
        id: "rv1",
        user_id: "u2",
        rating: "4",
        review_text: "Good noodles",
        photo_urls: [PHOTO],
        created_at: "2026-10-01T12:00:00Z",
        profiles: null,
      },
    ];
    renderSystem();

    const thumb = screen.getByAltText("Review photo");
    const thumbSet = thumb.getAttribute("srcset") ?? "";
    expect(thumbSet).toContain(`${RENDER}?width=96`);
    expect(thumbSet).toContain("288w");
    expect(thumbSet).not.toContain("640w");
    expect(thumb.getAttribute("sizes")).toBe("96px");
    expect(thumb.getAttribute("loading")).toBe("lazy");
    // The plain src stays the original, so a failed transform still shows the photo.
    expect(thumb.getAttribute("src")).toBe(PHOTO);

    await user.click(screen.getByRole("button", { name: "View review photo" }));
    const dialog = await screen.findByRole("dialog", { name: "Review photo" });
    const full = dialog.querySelector("img") as HTMLImageElement;
    const fullSet = full.getAttribute("srcset") ?? "";
    expect(fullSet).toContain(`${RENDER}?width=1280`);
    expect(fullSet).not.toContain("96w");
    // Opened on purpose and immediately visible: no reason to defer the fetch.
    expect(full.getAttribute("loading")).toBe("eager");
    ratingsState.ratings = [];
  });
});

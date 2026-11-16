import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-BE-055: public.trails (/outdoors and /outdoors/:slug) could only be
 * changed by migration. The editor must write values the table's CHECK
 * constraints and the /outdoors filters accept, keep a trail's URL, and not
 * drop data the form has no control for.
 */

const save = vi.fn();
const list = vi.fn();
vi.mock("@/hooks/useAdminTrails", () => ({
  useAdminTrails: () => list(),
  useSaveTrail: () => ({ mutateAsync: save, isPending: false }),
}));
vi.mock("@/hooks/useAdminSeasonalGuides", () => ({
  isDuplicateSlugError: (e: { code?: string }) => e?.code === "23505",
}));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TrailManager } from "@/components/admin/TrailManager";

const GRAYS = {
  id: "t1",
  name: "Gray's Lake Trail",
  slug: "grays-lake-trail",
  description: "A 1.9-mile loop.",
  length_miles: 1.9,
  difficulty: "easy",
  surface_type: "paved",
  activities: ["walking", "kayaking", "biking"],
  highlights: null,
  trailhead_address: "2101 Fleur Dr, Des Moines, IA 50321",
  latitude: 41.5673,
  longitude: -93.6333,
  image_url: null,
  website: null,
  is_featured: true,
};

beforeEach(() => {
  save.mockReset();
  list.mockReturnValue({ data: [GRAYS], isLoading: false, error: null });
});

describe("TrailManager", () => {
  it("lists trails with their public path", () => {
    render(<TrailManager />);
    const row = screen.getByText("Gray's Lake Trail").closest("tr") as HTMLElement;
    expect(within(row).getByText("/outdoors/grays-lake-trail")).toBeInTheDocument();
    expect(within(row).getByText("Easy")).toBeInTheDocument();
    expect(within(row).getByText("1.9 mi")).toBeInTheDocument();
  });

  it("creates a trail with a slug from the name and typed columns", async () => {
    save.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TrailManager />);
    await user.click(screen.getByRole("button", { name: /new trail/i }));
    await user.type(screen.getByLabelText("Name"), "Easter Lake Loop");
    expect(screen.getByLabelText("Slug")).toHaveValue("easter-lake-loop");
    await user.type(screen.getByLabelText("Length (miles)"), "4.2");
    await user.click(screen.getByLabelText("Biking"));
    await user.click(screen.getByLabelText("Hiking"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    const { id, row } = save.mock.calls[0][0];
    expect(id).toBeUndefined();
    expect(row).toEqual({
      name: "Easter Lake Loop",
      slug: "easter-lake-loop",
      difficulty: null,
      surface_type: null,
      activities: ["biking", "hiking"],
      length_miles: 4.2,
      description: null,
      highlights: null,
      trailhead_address: null,
      latitude: null,
      longitude: null,
      website: null,
      image_url: null,
      is_featured: false,
    });
  });

  it("keeps the slug and an activity the form has no checkbox for", async () => {
    save.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TrailManager />);
    await user.click(screen.getByRole("button", { name: "Edit Gray's Lake Trail" }));
    expect(screen.getByLabelText("Slug")).toBeDisabled();
    await user.click(screen.getByLabelText("Biking"));
    await user.click(screen.getByLabelText("Running"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    const { id, row } = save.mock.calls[0][0];
    expect(id).toBe("t1");
    expect(row.slug).toBe("grays-lake-trail");
    expect(row.activities).toEqual(["walking", "kayaking", "running"]);
    expect(row.difficulty).toBe("easy");
    expect(row.is_featured).toBe(true);
  });

  it("refuses a length past any trail here", async () => {
    const user = userEvent.setup();
    render(<TrailManager />);
    await user.click(screen.getByRole("button", { name: "Edit Gray's Lake Trail" }));
    const length = screen.getByLabelText("Length (miles)");
    await user.clear(length);
    await user.type(length, "256");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/up to 200/);
  });

  it("refuses coordinates with the sign dropped", async () => {
    const user = userEvent.setup();
    render(<TrailManager />);
    await user.click(screen.getByRole("button", { name: "Edit Gray's Lake Trail" }));
    const lng = screen.getByLabelText("Longitude");
    await user.clear(lng);
    await user.type(lng, "93.6333");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Longitude should be in Iowa/);
  });

  it("shows a slug clash on the slug field", async () => {
    save.mockRejectedValue({ code: "23505" });
    const user = userEvent.setup();
    render(<TrailManager />);
    await user.click(screen.getByRole("button", { name: /new trail/i }));
    await user.type(screen.getByLabelText("Name"), "Gray's Lake Trail");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Another trail already uses this slug.")).toBeInTheDocument();
  });
});

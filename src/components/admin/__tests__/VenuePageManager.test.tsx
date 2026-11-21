import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-BE-055: public.venues (the /music/venues pages, the hotel callout and
 * "hotels near" distances) had no admin surface; the admin Venues tab edits
 * known_venues. The editor must not write a row the page or the distance
 * math would get wrong, and must not move a page's URL.
 */

const save = vi.fn();
const list = vi.fn();
vi.mock("@/hooks/useAdminVenuePages", () => ({
  useAdminVenuePages: () => list(),
  useSaveVenuePage: () => ({ mutateAsync: save, isPending: false }),
}));
vi.mock("@/hooks/useAdminSeasonalGuides", () => ({
  isDuplicateSlugError: (e: { code?: string }) => e?.code === "23505",
}));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VenuePageManager } from "@/components/admin/VenuePageManager";

const WOOLYS = {
  id: "v1",
  name: "Woolys",
  slug: "woolys",
  description: null,
  address: "504 E Locust St, Des Moines, IA 50309",
  capacity: null,
  venue_type: "club",
  image_url: null,
  website: null,
  latitude: 41.5892,
  longitude: -93.6098,
  updated_at: null,
};

beforeEach(() => {
  save.mockReset();
  list.mockReturnValue({ data: [WOOLYS], isLoading: false, error: null });
});

describe("VenuePageManager", () => {
  it("lists venues with their public path", () => {
    render(<VenuePageManager />);
    const row = screen.getByText("Woolys").closest("tr") as HTMLElement;
    expect(within(row).getByText("/music/venues/woolys")).toBeInTheDocument();
    expect(within(row).getByText("Music Club")).toBeInTheDocument();
  });

  it("creates a venue with a slug from the name and typed columns", async () => {
    save.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<VenuePageManager />);
    await user.click(screen.getByRole("button", { name: /new venue/i }));
    await user.type(screen.getByLabelText("Name"), "Knapp Center");
    expect(screen.getByLabelText("Slug")).toHaveValue("knapp-center");
    await user.type(screen.getByLabelText("Latitude"), "41.6047");
    await user.type(screen.getByLabelText("Longitude"), "-93.6531");
    await user.type(screen.getByLabelText("Capacity"), "7152");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    const { id, row } = save.mock.calls[0][0];
    expect(id).toBeUndefined();
    expect(row).toMatchObject({
      name: "Knapp Center",
      slug: "knapp-center",
      venue_type: null,
      latitude: 41.6047,
      longitude: -93.6531,
      capacity: 7152,
      address: null,
    });
  });

  it("refuses coordinates with the sign dropped", async () => {
    const user = userEvent.setup();
    render(<VenuePageManager />);
    await user.click(screen.getByRole("button", { name: "Edit Woolys" }));
    const lng = screen.getByLabelText("Longitude");
    await user.clear(lng);
    await user.type(lng, "93.6098");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Longitude should be in Iowa/);
  });

  it("refuses one coordinate without the other", async () => {
    const user = userEvent.setup();
    render(<VenuePageManager />);
    await user.click(screen.getByRole("button", { name: "Edit Woolys" }));
    await user.clear(screen.getByLabelText("Latitude"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter both coordinates, or neither.");
  });

  it("keeps an existing venue's slug fixed", async () => {
    save.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<VenuePageManager />);
    await user.click(screen.getByRole("button", { name: "Edit Woolys" }));
    const slug = screen.getByLabelText("Slug");
    expect(slug).toBeDisabled();
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Wooly's");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const { id, row } = save.mock.calls[0][0];
    expect(id).toBe("v1");
    expect(row.name).toBe("Wooly's");
    expect(row.slug).toBe("woolys");
  });

  it("shows a slug clash on the slug field", async () => {
    save.mockRejectedValue({ code: "23505" });
    const user = userEvent.setup();
    render(<VenuePageManager />);
    await user.click(screen.getByRole("button", { name: /new venue/i }));
    await user.type(screen.getByLabelText("Name"), "Woolys");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Another venue already uses this slug.")).toBeInTheDocument();
  });
});

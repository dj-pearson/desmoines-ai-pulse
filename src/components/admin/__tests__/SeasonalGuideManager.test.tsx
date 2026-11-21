import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-BE-055: seasonal_guides had no admin surface, so adding a guide meant
 * SQL. The editor must write the content shape SeasonalGuide.tsx reads and
 * must not send a row the page cannot render.
 */

const save = vi.fn();
const remove = vi.fn();
const list = vi.fn();
vi.mock("@/hooks/useAdminSeasonalGuides", () => ({
  useAdminSeasonalGuides: () => list(),
  useSaveSeasonalGuide: () => ({ mutateAsync: save, isPending: false }),
  useDeleteSeasonalGuide: () => ({ mutateAsync: remove, isPending: false }),
  isDuplicateSlugError: (e: { code?: string }) => e?.code === "23505",
}));
vi.mock("@/lib/errorHandler", () => ({ handleError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SeasonalGuideManager } from "@/components/admin/SeasonalGuideManager";

const DRAFT = {
  id: "g1",
  title: "Winter Guide",
  slug: "winter-guide",
  season: "winter",
  description: null,
  cover_image: null,
  content: { sections: [{ title: "Skating", items: ["Brenton Skating Plaza"] }] },
  is_published: false,
  publish_date: null,
  seo_title: null,
  seo_description: null,
  updated_at: null,
};

beforeEach(() => {
  save.mockReset();
  remove.mockReset();
  list.mockReturnValue({ data: [DRAFT], isLoading: false, error: null });
});

describe("SeasonalGuideManager", () => {
  it("lists drafts alongside published guides", () => {
    render(<SeasonalGuideManager />);
    const row = screen.getByText("Winter Guide").closest("tr") as HTMLElement;
    expect(within(row).getByText("Draft")).toBeInTheDocument();
    expect(within(row).getByText("/guides/winter-guide")).toBeInTheDocument();
  });

  it("creates a guide with a slug taken from the title and sections parsed into content", async () => {
    save.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SeasonalGuideManager />);
    await user.click(screen.getByRole("button", { name: /new guide/i }));
    await user.type(screen.getByLabelText("Title"), "Spring in the East Village");
    expect(screen.getByLabelText("Slug")).toHaveValue("spring-in-the-east-village");
    await user.type(screen.getByLabelText("Sections"), "## Markets{enter}- Downtown Farmers Market");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
    const { id, row } = save.mock.calls[0][0];
    expect(id).toBeUndefined();
    expect(row.slug).toBe("spring-in-the-east-village");
    expect(row.content).toEqual({ sections: [{ title: "Markets", items: ["Downtown Farmers Market"] }] });
    expect(row.is_published).toBe(false);
  });

  it("does not save a malformed sections block and says which line", async () => {
    const user = userEvent.setup();
    render(<SeasonalGuideManager />);
    await user.click(screen.getByRole("button", { name: "Edit Winter Guide" }));
    const sections = screen.getByLabelText("Sections");
    await user.clear(sections);
    await user.type(sections, "## Skating{enter}Brenton");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/^Line 2:/);
  });

  it("keeps the dialog open with a slug error when the slug is taken", async () => {
    save.mockRejectedValue({ code: "23505" });
    const user = userEvent.setup();
    render(<SeasonalGuideManager />);
    await user.click(screen.getByRole("button", { name: "Edit Winter Guide" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[0][0].id).toBe("g1");
    expect(await screen.findByText("Another guide already uses this slug.")).toBeInTheDocument();
  });
});

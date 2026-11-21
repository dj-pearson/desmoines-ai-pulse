import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MediaAsset } from "@/hooks/useMediaLibrary";

/**
 * WEB-UX-057. The admin media library, content queue, template picker and
 * menu upload zones were Cards and divs with onClick and no tab stop, so a
 * keyboard user could not select media, pick a template or open the file
 * picker. Each now has one real button.
 */

function asset(id: string, title: string): MediaAsset {
  return {
    id,
    user_id: null,
    file_name: `${id}.jpg`,
    original_file_name: `${id}.jpg`,
    file_path: `media/${id}.jpg`,
    bucket_id: "media",
    mime_type: "application/pdf",
    file_size: 1024,
    width: null,
    height: null,
    duration_seconds: null,
    is_optimized: false,
    optimized_versions: {},
    blur_hash: null,
    dominant_color: null,
    alt_text: null,
    title,
    description: null,
    tags: [],
    content_type: "general",
    content_id: null,
    processing_status: "completed",
    processing_error: null,
    views_count: 0,
    downloads_count: 0,
    created_at: "2026-11-01T18:00:00Z",
    updated_at: "2026-11-01T18:00:00Z",
  };
}

const assets = [asset("a1", "Riverfront poster"), asset("a2", "Menu scan")];

vi.mock("@/hooks/useMediaLibrary", () => ({
  useMediaLibrary: () => ({
    data: { assets, total: assets.length },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMediaStats: () => ({ data: null }),
  useDeleteMediaAsset: () => ({ mutateAsync: vi.fn() }),
  useUpdateMediaAsset: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useMediaUpload", () => ({
  useMediaUpload: () => ({ upload: vi.fn(), isUploading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { MediaLibrary } = await import("@/components/admin/MediaLibrary");
const { default: ContentTemplateSelector } = await import("@/components/ContentTemplateSelector");

describe("ContentTemplateSelector by keyboard", () => {
  it("picks a template with Enter, which enables Continue", async () => {
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();
    render(
      <ContentTemplateSelector
        open
        onOpenChange={vi.fn()}
        contentType="event"
        onSelectTemplate={onSelectTemplate}
      />
    );

    const concert = screen.getByRole("button", { name: "Concert / Live Music" });
    expect(concert).toHaveAttribute("aria-pressed", "false");
    concert.focus();
    await user.keyboard("{Enter}");
    expect(concert).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Continue with Template" }));
    expect(onSelectTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "Concert / Live Music" }));
  });
});

describe("MediaLibrary selection by keyboard", () => {
  it("selects an asset with Enter and reports it through aria-pressed", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MediaLibrary selectionMode="single" onSelect={onSelect} />);

    const poster = screen.getByRole("button", { name: "Riverfront poster" });
    expect(poster).toHaveAttribute("aria-pressed", "false");

    poster.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    expect(poster).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles several assets with Space in multiple mode", async () => {
    const user = userEvent.setup();
    render(<MediaLibrary selectionMode="multiple" />);

    const poster = screen.getByRole("button", { name: "Riverfront poster" });
    const scan = screen.getByRole("button", { name: "Menu scan" });
    poster.focus();
    await user.keyboard(" ");
    scan.focus();
    await user.keyboard(" ");
    expect(poster).toHaveAttribute("aria-pressed", "true");
    expect(scan).toHaveAttribute("aria-pressed", "true");

    await user.keyboard(" ");
    expect(scan).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no select control when the library is not in a selection mode", () => {
    render(<MediaLibrary />);
    expect(screen.queryByRole("button", { name: "Riverfront poster" })).toBeNull();
    expect(screen.getByText("Riverfront poster")).toBeTruthy();
  });
});

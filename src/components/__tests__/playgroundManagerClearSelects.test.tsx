import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * WEB-UX-070. PlaygroundManager's "Unknown" / "Clear" options are
 * <SelectItem value="">. The story expected @radix-ui/react-select to throw
 * on that, as 2.0-2.1 did; the installed 2.3.7 does not, so the editors never
 * crashed. These pin what does matter: each editor opens, picking the clearing
 * option shows a named cleared state in the trigger (it showed a bare dash),
 * and saving writes null for that column.
 */

const updateCalls: Array<{ updates: Record<string, unknown>; ids: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (updates: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updateCalls.push({ updates, ids: id });
          return Promise.resolve({ error: null });
        },
        in: (_col: string, ids: string[]) => {
          updateCalls.push({ updates, ids });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

vi.mock("@/hooks/usePlaygrounds", () => ({
  usePlaygrounds: () => ({
    playgrounds: [
      {
        id: "pg-1",
        name: "Greenwood Park",
        location: "Des Moines",
        age_range: "2-5",
        surface_type: "mulch",
        has_restrooms: true,
        has_shade: false,
        accessibility_notes: null,
        manually_curated: false,
        source: "manual",
      },
    ],
    totalCount: 1,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(() => {
  // Radix Select reads these on open; jsdom has none of them.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  updateCalls.length = 0;
});

async function renderManager() {
  const { default: PlaygroundManager } = await import(
    "@/components/admin/PlaygroundManager"
  );
  render(<PlaygroundManager />);
}

async function pickOption(trigger: HTMLElement, optionName: string) {
  fireEvent.keyDown(trigger, { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  fireEvent.click(within(listbox).getByRole("option", { name: optionName }));
}

describe("PlaygroundManager clearing selects (WEB-UX-070)", () => {
  it.each([
    { cell: "Restrooms", field: "has_restrooms", option: "Unknown", shown: "Unknown" },
    { cell: "mulch", field: "surface_type", option: "Clear", shown: "Not set" },
    { cell: "2-5", field: "age_range", option: "Clear", shown: "Not set" },
  ])("inline $field editor opens and its $option option saves null", async ({ cell, field, option, shown }) => {
    await renderManager();
    fireEvent.click(screen.getByRole("button", { name: cell }));
    const trigger = await screen.findByRole("combobox", {
      name: field.replace(/_/g, " "),
    });
    await pickOption(trigger, option);
    await waitFor(() => expect(trigger).toHaveTextContent(shown));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(updateCalls[0].updates).toEqual({ manually_curated: true, [field]: null });
  });

  it("bulk surface editor opens and its Clear option saves null for the selection", async () => {
    await renderManager();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Greenwood Park" }));
    fireEvent.click(screen.getByRole("button", { name: "Surface…" }));
    const trigger = await screen.findByRole("combobox", { name: "New surface type" });
    await pickOption(trigger, "Clear");
    await waitFor(() => expect(trigger).toHaveTextContent("Not set"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));
    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(updateCalls[0]).toEqual({
      updates: { manually_curated: true, surface_type: null },
      ids: ["pg-1"],
    });
  });
});

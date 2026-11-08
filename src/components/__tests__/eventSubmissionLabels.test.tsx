import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * WEB-UX-064: /submit-event (and the same form in the dashboard's
 * Submissions tab) had four visible labels that named nothing. "Category *"
 * pointed htmlFor at an id no element had, so the Radix trigger was read by
 * its current value alone; "Event Date *" and "Add Custom Tag" had no htmlFor
 * at all; "Popular Tags" and "Selected Tags" were <label>s over button rows
 * that never said which tags were already on (WCAG 1.3.1 / 4.1.2).
 */

vi.mock("@/hooks/useUserSubmittedEvents", () => ({
  useSubmitEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useMediaUpload", () => ({
  useMediaUpload: () => ({ upload: vi.fn(), isUploading: false, progress: null, error: null }),
}));

import EventSubmissionForm from "@/components/EventSubmissionForm";

describe("event submission form labels (WEB-UX-064)", () => {
  it("names the category select by its label", () => {
    render(<EventSubmissionForm />);
    const category = screen.getByLabelText("Category *");
    expect(category).toHaveAttribute("role", "combobox");
  });

  it("names the date picker by its label and keeps the chosen date in the name", () => {
    render(<EventSubmissionForm />);
    const date = screen.getByRole("button", { name: /^Event Date \*/ });
    expect(date).toHaveAccessibleName("Event Date * Pick a date");
  });

  it("names the custom tag field", () => {
    render(<EventSubmissionForm />);
    const field = screen.getByLabelText("Add Custom Tag");
    expect(field.tagName).toBe("INPUT");
  });

  it("groups popular tags under their heading and reports which are on", async () => {
    const user = userEvent.setup();
    render(<EventSubmissionForm />);
    const group = screen.getByRole("group", { name: "Popular Tags" });
    const free = within(group).getByRole("button", { name: "Free" });
    expect(free).toHaveAttribute("aria-pressed", "false");

    await user.click(free);
    expect(free).toHaveAttribute("aria-pressed", "true");

    const selected = screen.getByRole("group", { name: "Selected Tags" });
    expect(within(selected).getByRole("button", { name: "Remove tag Free" })).toBeInTheDocument();
  });
});

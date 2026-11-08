import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RichTextEditor } from "@/components/cms/RichTextEditor";

/**
 * WEB-UX-058: the CMS editor's Link and Insert image popovers put a bare
 * <label> beside the URL input with no htmlFor, so the field's only name was
 * its placeholder, which disappears once you type (WCAG 1.3.1 / 4.1.2).
 */
describe("RichTextEditor popover field labels (WEB-UX-058)", () => {
  it("names the Link URL field", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor content="<p>Hello</p>" onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Link" }));
    const field = await screen.findByLabelText("Link URL");
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("placeholder", "https://example.com");
  });

  it("names the Image URL field", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor content="<p>Hello</p>" onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Insert image" }));
    const field = await screen.findByLabelText("Image URL");
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("placeholder", "https://example.com/image.jpg");
  });

  it("gives each editor instance its own field ids", async () => {
    const user = userEvent.setup();
    render(
      <>
        <RichTextEditor content="<p>One</p>" onChange={() => {}} />
        <RichTextEditor content="<p>Two</p>" onChange={() => {}} />
      </>,
    );

    const [firstLink, secondLink] = screen.getAllByRole("button", { name: "Link" });
    await user.click(firstLink);
    const first = await screen.findByLabelText("Link URL");
    await user.keyboard("{Escape}");
    await user.click(secondLink);
    const second = await screen.findByLabelText("Link URL");
    expect(first.id).not.toBe("");
    expect(second.id).not.toBe(first.id);
  });
});

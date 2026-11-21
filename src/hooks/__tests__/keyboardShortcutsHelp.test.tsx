import { describe, it, expect } from "vitest";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import KeyboardShortcutListener from "@/components/KeyboardShortcutListener";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";

/**
 * WEB-UX-067. On a US layout "?" is Shift+/, so the browser sends
 * key "?" with shiftKey true. The listener used to require !shiftKey, which
 * meant the help dialog the footer advertises never opened from a real
 * keyboard. These events carry shiftKey the way a keyboard does.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter>
      <KeyboardShortcutListener onShowHelp={() => setOpen(true)} />
      <label htmlFor="q">Search</label>
      <input id="q" type="search" />
      <textarea aria-label="Notes" />
      <KeyboardShortcutsModal open={open} onOpenChange={setOpen} />
    </MemoryRouter>
  );
}

const pressQuestionMark = (target: Element) =>
  fireEvent.keyDown(target, { key: "?", code: "Slash", shiftKey: true });

describe("keyboard shortcuts help (WEB-UX-067)", () => {
  it("opens the shortcuts dialog on Shift+/ with focus on the page", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();

    pressQuestionMark(document.body);

    expect(
      screen.getByRole("dialog", { name: "Keyboard Shortcuts" }),
    ).toBeInTheDocument();
  });

  it("does nothing when the reader types ? in an input or textarea", () => {
    render(<Harness />);

    pressQuestionMark(screen.getByRole("searchbox", { name: "Search" }));
    pressQuestionMark(screen.getByRole("textbox", { name: "Notes" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves Ctrl/Cmd/Alt + ? to the browser and other handlers", () => {
    render(<Harness />);

    fireEvent.keyDown(document.body, { key: "?", shiftKey: true, ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true, metaKey: true });
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true, altKey: true });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * WEB-AUTH-008. The signup interest tiles were a <div onClick> wrapping a
 * Radix Checkbox given `onChange`. Radix exposes onCheckedChange and ignores
 * onChange, so that handler was dead; the div's onClick did the work.
 *
 * THE FIRST VERSION OF THIS TEST ASSERTED THE WRONG DEFECT and failed, which
 * is why it is written down here: the old shape WAS keyboard-operable. Space
 * on the focused Radix checkbox fires a click, which bubbles to the div's
 * onClick, so the tile toggled. The real defect is one level up - the label
 * text is a sibling <span>, associated with nothing, so the checkbox has NO
 * ACCESSIBLE NAME. A screen-reader user tabbing the eight tiles hears
 * "checkbox, not checked" eight times and cannot tell food from nightlife.
 *
 * Both shapes are reproduced side by side rather than rendering /auth, which
 * needs the auth context, the router and a Supabase client.
 */
function BrokenTile({ onToggle }: { onToggle: () => void }) {
  return (
    <div onClick={onToggle}>
      {/* @ts-expect-error - onChange is exactly the mistake being reproduced */}
      <Checkbox checked={false} onChange={onToggle} />
      <span>Food &amp; Dining</span>
    </div>
  );
}

function FixedTile() {
  const [checked, setChecked] = useState(false);
  return (
    <label>
      <Checkbox checked={checked} onCheckedChange={() => setChecked((c) => !c)} />
      <span>Food &amp; Dining</span>
    </label>
  );
}

describe("signup interest tiles", () => {
  it("the old shape left every checkbox nameless", async () => {
    render(<BrokenTile onToggle={() => {}} />);

    // The control is there and it is a checkbox. What it is FOR is not.
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /food & dining/i })).toBeNull();
  });

  it("the fixed shape names the checkbox from the tile text", () => {
    render(<FixedTile />);
    expect(screen.getByRole("checkbox", { name: /food & dining/i })).toBeTruthy();
  });

  it("toggles from the keyboard with Space", async () => {
    const user = userEvent.setup();
    render(<FixedTile />);

    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("data-state")).toBe("unchecked");

    await user.tab();
    await user.keyboard(" ");
    expect(box.getAttribute("data-state")).toBe("checked");

    await user.keyboard(" ");
    expect(box.getAttribute("data-state")).toBe("unchecked");
  });

  it("still toggles when the label text is clicked", async () => {
    // The tile is clickable across its whole area, which is what the old
    // <div onClick> bought. The <label> keeps that without the div.
    const user = userEvent.setup();
    render(<FixedTile />);

    await user.click(screen.getByText(/food & dining/i));
    expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("checked");
  });
});

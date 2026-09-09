import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * WEB-AUTH-008. /auth had no way to see what you had typed, on the one form
 * where a typo costs you the sign-in and the error tells you nothing useful.
 */
describe("PasswordInput", () => {
  it("starts masked and reveals on toggle", async () => {
    const user = userEvent.setup();
    render(<PasswordInput id="password" defaultValue="hunter2" />);

    const field = document.getElementById("password") as HTMLInputElement;
    expect(field.type).toBe("password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(field.type).toBe("text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(field.type).toBe("password");
  });

  it("announces its state with aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PasswordInput id="password" />);

    const toggle = screen.getByRole("button", { name: /show password/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: /hide password/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("is type=button so revealing does not submit the form", async () => {
    // A <button> with no type inside a form submits it. Here that would fire a
    // sign-in attempt with whatever is typed so far, every time someone wants
    // to check their own password.
    const user = userEvent.setup();
    let submitted = false;
    render(
      <form onSubmit={() => { submitted = true; }}>
        <PasswordInput id="password" />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(submitted).toBe(false);
  });
});

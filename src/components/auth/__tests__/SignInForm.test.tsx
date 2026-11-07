import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInForm, type SignInError } from "@/components/auth/SignInForm";

/**
 * A wrong password used to be a five-second toast and nothing else: the
 * fields were never marked invalid and nothing stayed near the form. The
 * failure now sits in a role="alert" slot above the button, both fields point
 * at it, and editing either one clears it.
 */

const CREDENTIALS: SignInError = {
  kind: "credentials",
  title: "Sign in failed",
  message: "That email and password don't match. Check for typos, or reset your password.",
};

function setup(result: SignInError | void) {
  const onSubmit = vi.fn().mockResolvedValue(result);
  render(
    <SignInForm
      onSubmit={onSubmit}
      onForgotPassword={vi.fn()}
      lockoutSecondsLeft={0}
      unconfirmedEmail={null}
      onResendConfirmation={vi.fn()}
      isResending={false}
    />,
  );
  const email = screen.getByLabelText(/^email$/i);
  const password = screen.getByLabelText(/^password$/i, { selector: "input" });
  return { onSubmit, email, password };
}

async function failSignIn(result: SignInError) {
  const user = userEvent.setup();
  const fields = setup(result);
  await user.type(fields.email, "someone@example.com");
  await user.type(fields.password, "wrong-password");
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(result.message));
  return { user, ...fields };
}

describe("SignInForm failure message", () => {
  it("shows a credentials failure in an alert and marks both fields invalid", async () => {
    const { email, password } = await failSignIn(CREDENTIALS);
    const alert = screen.getByRole("alert");

    for (const field of [email, password]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    }
    // The button was the active element, so focus goes back to the password.
    expect(password).toHaveFocus();
  });

  it("clears the alert and the invalid marks when a field is edited", async () => {
    const { user, email, password } = await failSignIn(CREDENTIALS);

    await user.type(password, "x");

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    for (const field of [email, password]) {
      expect(field).toHaveAttribute("aria-invalid", "false");
      expect(field.getAttribute("aria-describedby") ?? "").not.toContain(screen.getByRole("alert").id);
    }
  });

  it("does not mark the fields invalid for a rate limit", async () => {
    const { email, password } = await failSignIn({
      kind: "rate_limited",
      title: "Too many attempts",
      message: "Too many attempts from this device. Wait a minute and try again.",
    });

    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(password).toHaveAttribute("aria-invalid", "false");
  });

  it("shows nothing when the submit succeeds", async () => {
    const user = userEvent.setup();
    const { onSubmit, email, password } = setup(undefined);
    await user.type(email, "someone@example.com");
    await user.type(password, "right-password");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});

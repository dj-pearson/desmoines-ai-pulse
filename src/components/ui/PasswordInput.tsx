import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle (WEB-AUTH-008).
 *
 * /auth had no way to see what you had typed, on the one form where a typo
 * costs you the sign-in and tells you nothing useful about why. It is a
 * component rather than two copies of the same state because the login and
 * signup fields both need it and they are 200 lines apart.
 *
 * The toggle is a real <button type="button">: inside a form, a button with no
 * explicit type submits it, so revealing your password would attempt a sign-in.
 * It is a toggle button: one fixed name, "Show password", and aria-pressed for
 * the state, so a screen reader says "Show password, toggle button, pressed"
 * when the text is visible. A name that flipped to "Hide password" as well as
 * pressed=true said the state twice and contradicted itself ("Hide password,
 * pressed").
 *
 * It is in the tab order. It used to carry tabIndex={-1} so Tab would go
 * straight from the field to Sign In, which left keyboard-only users with no
 * way to reveal the password at all: WCAG 2.1.1 requires every function to be
 * operable from the keyboard, and a mouse click is not a keyboard.
 */
type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Label for the toggle, for forms where "password" is ambiguous. */
  toggleLabel?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, toggleLabel = "password", ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={`Show ${toggleLabel}`}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);

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
 * It carries aria-pressed so a screen reader announces the state rather than
 * just the label, and it is excluded from the tab order deliberately - see
 * below.
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
          // tabIndex -1 on purpose: the toggle sits between the password field
          // and the submit button, and a keyboard user filling the form wants
          // Tab to go to Sign In. It stays reachable by click and by screen
          // reader, which is who it is for. (WCAG 2.1 AA does not require every
          // control in the tab order, and 2.4.3 is about ORDER, not inclusion.)
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`}
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

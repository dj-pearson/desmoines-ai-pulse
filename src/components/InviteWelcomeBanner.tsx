import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brandConfig";

interface InviteWelcomeBannerProps {
  /** Where the visitor is now; sign-up returns them here. */
  pathname: string;
  onDismiss: () => void;
}

/**
 * The strip an invited visitor sees (WEB-ADS-034).
 *
 * An invite link opened the home page like any other visit: the ?ref code was
 * stored for attribution and nothing on the page said a friend had sent it or
 * what to do next, so the one visitor most likely to sign up was given no
 * reason to. attribute_referral only counts an account made within 24 hours
 * of the visit, so the ask has to be on the page they land on.
 *
 * The copy promises only what an account does today (the same line
 * NewsletterConfirm uses); there is no invite reward, so none is offered.
 * Sign-up returns to the page the visitor was on, without the ?ref: the code
 * is already stored and travels onto the account at sign-up (WEB-ADS-032).
 */
export function InviteWelcomeBanner({ pathname, onDismiss }: InviteWelcomeBannerProps) {
  const signupHref = `/auth?mode=signup&redirect=${encodeURIComponent(pathname || "/")}`;
  return (
    <aside aria-label="Invitation" className="border-b border-border bg-muted text-foreground print:hidden">
      <div className="container mx-auto flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose">
          <span className="font-semibold">A friend sent you to {BRAND.name}.</span> Save events, restaurants and places
          to a free account.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" className="min-h-11">
            <Link to={signupHref}>Create a free account</Link>
          </Button>
          <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </aside>
  );
}

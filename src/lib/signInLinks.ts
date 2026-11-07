import { isValidRedirectUrl } from "@/lib/redirectSafety";

/**
 * The shell's auth links, kept apart from header/navigationConfig.ts.
 *
 * BottomNav is in the entry chunk. When it imported signInHref from
 * navigationConfig it pulled that file's icon imports onto every page's
 * critical path (check-bundle-budget). navigationConfig re-exports these.
 */

/** Where the shell's auth links bring a visitor back to: this page, or "/". */
function returnPath(pathname: string, search: string): string {
  if (pathname.startsWith("/auth")) return "/";
  const here = `${pathname}${search}`;
  if (isValidRedirectUrl(here)) return here;
  return isValidRedirectUrl(pathname) ? pathname : "/";
}

/**
 * The shell's "Sign Up Free" links: opens the sign-up tab and comes back to
 * the page the visitor was on. Auth validates `redirect` again.
 */
export function signUpHref(pathname: string, search = ""): string {
  return `/auth?mode=signup&redirect=${encodeURIComponent(returnPath(pathname, search))}`;
}

/** Sign in, coming back to the current page. */
export function signInHref(pathname: string, search = ""): string {
  const target = returnPath(pathname, search);
  return target === "/" ? "/auth" : `/auth?redirect=${encodeURIComponent(target)}`;
}

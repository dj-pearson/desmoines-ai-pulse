import { useEffect, useState } from "react";
import { useAuthFlags, useAuthActions } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useUserLevel } from "@/hooks/useUserLevel";
import { useAccessibility } from "@/hooks/useAccessibility";
import { useSwipe } from "@/hooks/use-swipe";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { OptimizedLogo } from "./OptimizedLogo";
import { DesktopNav } from "./header/DesktopNav";
import { MobileNav } from "./header/MobileNav";
import { UserMenu } from "./header/UserMenu";
import { signUpHref } from "./header/navigationConfig";
import { Button } from "@/components/ui/button";
import { createLogger } from '@/lib/logger';

const log = createLogger('Header');

/** True when a keypress belongs to whatever has focus, not to the page. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function Header() {
  // Flags + actions only (no user/session) so the header doesn't re-render on
  // token-refresh ticks. (WEB-PERF-005)
  const { isAuthenticated, isAdmin } = useAuthFlags();
  const { logout } = useAuthActions();
  const { profile } = useProfile();
  // One cached user_reputation read instead of useGamification's six-way fetch
  // on every page mount.
  const { level: userLevel, xp: userXP } = useUserLevel();
  const { announceToScreenReader, useFocusRestore } = useAccessibility();
  const { saveFocus, restoreFocus } = useFocusRestore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  // "/" and search. App's useKeyboardShortcuts already focuses a search box
  // when the page has one (the hero on /, the field on /search). This covers
  // every other page: with no box to focus, "/" goes to /search. Ignored while
  // typing in a field and with a modifier held, so it never eats a character
  // or a browser shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (document.activeElement?.closest('[role="dialog"]')) return;
      if (document.querySelector('input[type="search"], input[role="searchbox"]')) return;
      e.preventDefault();
      navigate("/search");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
  // Route changes are announced once, by useFocusOnRouteChange in the App
  // shell. Header used to announce them too, so every navigation spoke twice.

  const handleLogout = async () => {
    try {
      announceToScreenReader("Signing out...", "polite");
      await logout();
      announceToScreenReader("Successfully signed out", "polite");
      // Use React Router navigate instead of window.location to prevent potential open redirect
      navigate("/", { replace: true });
    } catch (error) {
      log.error('logout', 'Logout failed', { data: error });
      announceToScreenReader("Logout failed", "assertive");
    }
  };

  const handleMobileMenuToggle = (isOpen: boolean) => {
    if (isOpen) {
      saveFocus();
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
    } else {
      restoreFocus();
    }
    setIsMobileMenuOpen(isOpen);
  };

  // Swipe gesture to close mobile menu
  const swipeRef = useSwipe<HTMLDivElement>({
    onSwipeRight: () => {
      if (isMobileMenuOpen) {
        handleMobileMenuToggle(false);
      }
    },
    threshold: 100,
  });

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return "U";
  };

  return (
    <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border sticky top-0 z-50 safe-area-top">
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <div className="container mx-auto mobile-padding">
        <div className="flex items-center touch-target gap-2 lg:gap-4">
          {/* Logo */}
          <Link
            to="/"
            className="tap-area-44 flex items-center smooth-transition hover:opacity-80 flex-shrink-0"
            aria-label="Des Moines Insider Home"
          >
            <OptimizedLogo
              variant="logo2"
              alt="Des Moines Insider"
              className="h-8 md:h-10 w-auto dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] dark:filter dark:brightness-110"
              width={40}
              height={40}
              fetchPriority="auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <DesktopNav />

          {/* Sign Up CTA for non-authenticated users (desktop only) */}
          {!isAuthenticated && (
            <Button asChild size="sm" className="hidden lg:inline-flex flex-shrink-0 font-semibold">
              <Link to={signUpHref(pathname, search)}>Sign Up Free</Link>
            </Button>
          )}

          {/* Search, Mobile Menu + User Actions */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-11 w-11 flex-shrink-0 rounded-lg"
            >
              <Link to="/search" aria-label="Search" aria-keyshortcuts="/" title="Search (press /)">
                <Search className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            {/* Mobile Menu */}
            <MobileNav
              isOpen={isMobileMenuOpen}
              onOpenChange={handleMobileMenuToggle}
              swipeRef={swipeRef as React.RefObject<HTMLDivElement>}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              profile={profile}
              userLevel={userLevel}
              userXP={userXP}
              onLogout={handleLogout}
              getInitials={getInitials}
            />

            {/* Desktop User Actions */}
            <UserMenu
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              profile={profile}
              userLevel={userLevel}
              userXP={userXP}
              onLogout={handleLogout}
              getInitials={getInitials}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useGamification } from "@/hooks/useGamification";
import { useAccessibility } from "@/hooks/useAccessibility";
import { useSwipe } from "@/hooks/use-swipe";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { OptimizedLogo } from "./OptimizedLogo";
import { DesktopNav } from "./header/DesktopNav";
import { MobileNav } from "./header/MobileNav";
import { UserMenu } from "./header/UserMenu";
import { createLogger } from '@/lib/logger';

const log = createLogger('Header');

export default function Header() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useProfile();
  const { userLevel, userXP } = useGamification();
  const { announceToScreenReader, useFocusRestore } = useAccessibility();
  const { saveFocus, restoreFocus } = useFocusRestore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Announce route changes to screen readers
  useEffect(() => {
    const pageTitle = document.title;
    if (pageTitle) {
      announceToScreenReader(`Navigated to ${pageTitle}`, "polite");
    }
  }, [location.pathname, announceToScreenReader]);

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
            className="flex items-center smooth-transition hover:opacity-80 flex-shrink-0"
            aria-label="Des Moines Insider Home"
          >
            <OptimizedLogo
              variant="logo2"
              alt="Des Moines Insider"
              className="h-8 md:h-10 w-auto dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] dark:filter dark:brightness-110"
              width={40}
              height={40}
            />
          </Link>

          {/* Desktop Navigation */}
          <DesktopNav />

          {/* Mobile Menu + User Actions */}
          <div className="flex items-center gap-2">
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

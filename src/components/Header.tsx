import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useGamification } from "@/hooks/useGamification";
import { useAccessibility } from "@/hooks/useAccessibility";
import { useSwipe } from "@/hooks/use-swipe";
import { Link, useLocation } from "react-router-dom";
import {
  User,
  LogOut,
  Settings,
  Shield,
  Menu,
  Calendar,
  CalendarDays,
  CalendarCheck,
  MapPin,
  Camera,
  Gamepad2,
  Users,
  Trophy,
  Building2,
  FileText,
  X,
} from "lucide-react";
import { AdvertiseButton } from "./AdvertiseButton";
import SubmitEventButton from "./SubmitEventButton";
import { ThemeToggle } from "./ThemeToggle";
import { OptimizedLogo } from "./OptimizedLogo";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
export default function Header() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useProfile();
  const { userLevel, userXP } = useGamification();
  const { announceToScreenReader, useFocusRestore } = useAccessibility();
  const { saveFocus, restoreFocus } = useFocusRestore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Announce route changes to screen readers
  useEffect(() => {
    const pageTitle = document.title;
    if (pageTitle) {
      announceToScreenReader(`Navigated to ${pageTitle}`, "polite");
    }
  }, [location.pathname, announceToScreenReader]);

  const handleLogout = async () => {
    announceToScreenReader("Signing out...", "polite");
    await logout();
    announceToScreenReader("Successfully signed out", "polite");
  };

  const handleMobileMenuToggle = (isOpen: boolean) => {
    if (isOpen) {
      saveFocus();
      // Haptic feedback on open (if supported)
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

  const isActivePath = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  const navigationLinks = [
    { href: "/events", label: "Events", icon: Calendar },
    {
      href: "/events/today",
      label: "Today's Events",
      icon: Calendar,
      priority: true,
    },
    {
      href: "/events/this-weekend",
      label: "This Weekend",
      icon: Calendar,
      priority: true,
    },
    { href: "/weekend", label: "Weekend Guide", icon: CalendarDays },
    { href: "/restaurants", label: "Restaurants", icon: MapPin },
    { href: "/attractions", label: "Attractions", icon: Camera },
    { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
    { href: "/articles", label: "Articles", icon: FileText },
  ];

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
          {/* Logo - Mobile Optimized with Dark Mode Glow - Fixed Width */}
          <Link
            to="/"
            className="flex items-center smooth-transition hover:opacity-80 flex-shrink-0"
            aria-label="Des Moines Insider Home"
          >
            <OptimizedLogo
              variant="logo2"
              alt="Des Moines Insider"
              className="h-8 md:h-10 w-auto dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] dark:filter dark:brightness-110"
              height={40}
            />
          </Link>

          {/* Desktop Navigation - Scrollable if needed */}
          <nav
            className="hidden lg:flex items-center gap-2 xl:gap-3 flex-1 overflow-x-auto min-w-0 scrollbar-width-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="navigation"
            aria-label="Main navigation"
          >
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "flex items-center gap-1.5 smooth-transition touch-target relative text-sm xl:text-base flex-shrink-0",
                  isActivePath(link.href)
                    ? "text-primary font-medium after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
                onMouseEnter={() => prefetchRoute(link.href)}
                onFocus={() => prefetchRoute(link.href)}
                aria-current={isActivePath(link.href) ? "page" : undefined}
              >
                <link.icon className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-nowrap">{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* Mobile Menu + User Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Sheet
              open={isMobileMenuOpen}
              onOpenChange={handleMobileMenuToggle}
            >
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden touch-feedback min-h-[44px] min-w-[44px] rounded-lg"
                  aria-label={
                    isMobileMenuOpen
                      ? "Close navigation menu"
                      : "Open navigation menu"
                  }
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="mobile-navigation"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[85vw] sm:w-[350px] flex flex-col max-h-screen safe-area-inset"
                id="mobile-navigation"
                aria-label="Mobile navigation menu"
              >
                <SheetHeader className="flex-shrink-0 flex flex-row items-center justify-between">
                  <SheetTitle className="text-xl">Menu</SheetTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMobileMenuToggle(false)}
                    className="touch-feedback rounded-full h-10 w-10 p-0"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </SheetHeader>
                <div
                  ref={swipeRef}
                  className="flex-1 overflow-y-auto py-6 scroll-smooth-mobile"
                  role="none"
                >
                  <nav
                    className="space-y-2"
                    role="navigation"
                    aria-label="Mobile navigation"
                  >
                    {navigationLinks.map((link) => (
                      <Link
                        key={link.href}
                        to={link.href}
                        onClick={() => {
                          handleMobileMenuToggle(false);
                          if ('vibrate' in navigator) {
                            navigator.vibrate(10);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl touch-feedback min-h-[56px]",
                          isActivePath(link.href)
                            ? "bg-primary/10 text-primary border-2 border-primary/30 font-semibold"
                            : "hover:bg-muted border-2 border-transparent"
                        )}
                        onMouseEnter={() => prefetchRoute(link.href)}
                        onFocus={() => prefetchRoute(link.href)}
                        aria-current={
                          isActivePath(link.href) ? "page" : undefined
                        }
                      >
                        <link.icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-base font-medium">
                          {link.label}
                        </span>
                      </Link>
                    ))}
                  </nav>

                  {/* Mobile Theme Toggle */}
                  <div className="border-t border-border pt-4 mt-6">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl min-h-[56px]">
                      <span className="text-base font-medium">Theme</span>
                      <ThemeToggle />
                    </div>
                  </div>
                  {/* Mobile Submit Event and Advertise Buttons */}
                  <div className="border-t border-border pt-4 mt-6 space-y-3">
                    <div
                      onClick={() => {
                        handleMobileMenuToggle(false);
                        if ('vibrate' in navigator) {
                          navigator.vibrate(10);
                        }
                      }}
                      className="w-full"
                    >
                      <SubmitEventButton />
                    </div>
                    <div
                      onClick={() => {
                        handleMobileMenuToggle(false);
                        if ('vibrate' in navigator) {
                          navigator.vibrate(10);
                        }
                      }}
                      className="w-full"
                    >
                      <AdvertiseButton />
                    </div>
                  </div>

                  {/* Mobile User Actions */}
                  {isAuthenticated ? (
                    <div className="border-t border-border pt-4 mt-6">
                      <div className="flex items-center gap-3 p-4 mb-4 bg-muted/50 rounded-lg">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {getInitials()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                          {profile && (
                            <p className="font-semibold text-base truncate">
                              {profile.first_name} {profile.last_name}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground truncate">
                            {profile?.email}
                          </p>
                          {userLevel && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full">
                                <Trophy className="h-3 w-3 text-primary" />
                                <span className="text-xs font-medium text-primary">
                                  Lvl {userLevel}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {userXP || 0} XP
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Link
                          to="/profile"
                          onClick={() => handleMobileMenuToggle(false)}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                          aria-label="Go to profile page"
                        >
                          <User
                            className="h-5 w-5 text-primary flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-base">Profile</span>
                        </Link>

                        <Link
                          to="/my-events"
                          onClick={() => handleMobileMenuToggle(false)}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                          aria-label="Go to my events page"
                        >
                          <CalendarCheck
                            className="h-5 w-5 text-primary flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-base">My Events</span>
                        </Link>

                        <Link
                          to="/dashboard"
                          onClick={() => handleMobileMenuToggle(false)}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                          aria-label="Go to dashboard"
                        >
                          <Settings
                            className="h-5 w-5 text-primary flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-base">Dashboard</span>
                        </Link>

                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={() => handleMobileMenuToggle(false)}
                            className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                            aria-label="Go to admin dashboard"
                          >
                            <Shield
                              className="h-5 w-5 text-primary flex-shrink-0"
                              aria-hidden="true"
                            />
                            <span className="text-base">Admin</span>
                          </Link>
                        )}

                        <button
                          onClick={() => {
                            handleLogout();
                            handleMobileMenuToggle(false);
                          }}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target w-full text-left"
                          aria-label="Sign out of your account"
                        >
                          <LogOut
                            className="h-5 w-5 text-destructive flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-base">Sign out</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border pt-4 mt-6">
                      <Link
                        to="/auth"
                        onClick={() => handleMobileMenuToggle(false)}
                        className="block w-full"
                        aria-label="Sign in to your account"
                      >
                        <Button className="w-full h-12 text-base touch-target">
                          Sign In
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Desktop User Actions - Stays on the right */}
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              <ThemeToggle />
              <SubmitEventButton />
              <AdvertiseButton />
              {isAuthenticated ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="relative touch-target rounded-full"
                        aria-label={`Account menu for ${
                          profile?.first_name || "User"
                        }`}
                        aria-expanded="false"
                        aria-haspopup="menu"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {getInitials()}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 bg-background border border-border shadow-lg z-50"
                      align="end"
                      forceMount
                      sideOffset={8}
                      role="menu"
                      aria-label="Account menu"
                    >
                      <div className="flex items-center justify-start gap-2 p-2">
                        <div className="flex flex-col space-y-1 leading-none">
                          {profile && (
                            <p className="font-medium">
                              {profile.first_name} {profile.last_name}
                            </p>
                          )}
                          <p className="w-[200px] truncate text-sm text-muted-foreground">
                            {profile?.email}
                          </p>
                          {userLevel && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full">
                                <Trophy className="h-3 w-3 text-primary" />
                                <span className="text-xs font-medium text-primary">
                                  Level {userLevel}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {userXP || 0} XP
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/profile"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to profile page"
                        >
                          <User className="mr-2 h-4 w-4" aria-hidden="true" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/my-events"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to my events page"
                        >
                          <CalendarCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                          My Events
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/dashboard"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to dashboard"
                        >
                          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/gamification"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to level up page"
                        >
                          <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />
                          Level Up
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/social"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to social page"
                        >
                          <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                          Social
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/calendar"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to smart calendar page"
                        >
                          <Calendar
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Smart Calendar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link
                          to="/business"
                          className="flex items-center"
                          role="menuitem"
                          aria-label="Go to business hub"
                        >
                          <Building2
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Business Portal
                        </Link>
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem asChild role="none">
                          <Link
                            to="/admin"
                            className="flex items-center"
                            role="menuitem"
                            aria-label="Go to admin dashboard"
                          >
                            <Shield
                              className="mr-2 h-4 w-4"
                              aria-hidden="true"
                            />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleLogout}
                        role="menuitem"
                        aria-label="Sign out of your account"
                      >
                        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Link to="/auth" aria-label="Sign in to your account">
                  <Button className="touch-target">Sign In</Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

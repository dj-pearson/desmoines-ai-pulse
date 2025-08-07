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
import { useAccessibility } from "@/hooks/useAccessibility";
import { Link, useLocation } from "react-router-dom";
import {
  User,
  LogOut,
  Settings,
  Shield,
  Menu,
  Calendar,
  MapPin,
  Camera,
  Gamepad2,
  Users,
  Trophy,
} from "lucide-react";
import { AdvertiseButton } from "./AdvertiseButton";
import SubmitEventButton from "./SubmitEventButton";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export default function Header() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useProfile();
  const { announceToScreenReader, useFocusRestore } = useAccessibility();
  const { saveFocus, restoreFocus } = useFocusRestore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Announce route changes to screen readers
  useEffect(() => {
    const pageTitle = document.title;
    if (pageTitle) {
      announceToScreenReader(`Navigated to ${pageTitle}`, 'polite');
    }
  }, [location.pathname, announceToScreenReader]);

  const handleLogout = async () => {
    announceToScreenReader('Signing out...', 'polite');
    await logout();
    announceToScreenReader('Successfully signed out', 'polite');
  };

  const handleMobileMenuToggle = (isOpen: boolean) => {
    if (isOpen) {
      saveFocus();
    } else {
      restoreFocus();
    }
    setIsMobileMenuOpen(isOpen);
  };

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return "U";
  };

  const isActivePath = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const navigationLinks = [
    { href: "/events", label: "Events", icon: Calendar },
    { href: "/restaurants", label: "Restaurants", icon: MapPin },
    { href: "/attractions", label: "Attractions", icon: Camera },
    { href: "/playgrounds", label: "Playgrounds", icon: Gamepad2 },
  ];

  return (
    <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border sticky top-0 z-50 safe-area-top">
      <div className="container mx-auto mobile-padding">
        <div className="flex justify-between items-center touch-target">
          {/* Logo - Mobile Optimized with Dark Mode Glow */}
          <Link
            to="/"
            className="flex items-center smooth-transition hover:opacity-80"
          >
            <img
              src="/DMI-Logo-Header.png"
              alt="Des Moines Insider"
              className="h-8 md:h-10 w-auto dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] dark:filter dark:brightness-110"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-6" role="navigation" aria-label="Main navigation">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "flex items-center gap-2 smooth-transition touch-target relative",
                  isActivePath(link.href)
                    ? "text-primary font-medium after:absolute after:bottom-[-8px] after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
                aria-current={isActivePath(link.href) ? "page" : undefined}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu + User Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={handleMobileMenuToggle}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden touch-target"
                  aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="mobile-navigation"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent 
                side="right" 
                className="w-[300px] sm:w-[350px] flex flex-col max-h-screen"
                id="mobile-navigation"
                aria-label="Mobile navigation menu"
              >
                <SheetHeader className="flex-shrink-0">
                  <SheetTitle>Navigation Menu</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-6" role="none">
                  <nav className="space-y-2" role="navigation" aria-label="Mobile navigation">
                    {navigationLinks.map((link) => (
                      <Link
                        key={link.href}
                        to={link.href}
                        onClick={() => handleMobileMenuToggle(false)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg smooth-transition touch-target",
                          isActivePath(link.href)
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "hover:bg-muted"
                        )}
                        aria-current={isActivePath(link.href) ? "page" : undefined}
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
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <span className="text-base font-medium">Theme</span>
                      <ThemeToggle />
                    </div>
                  </div>
                  {/* Mobile Submit Event and Advertise Buttons */}
                  <div className="border-t border-border pt-4 mt-6 space-y-3">
                    <div onClick={() => handleMobileMenuToggle(false)} className="w-full">
                      <SubmitEventButton />
                    </div>
                    <div onClick={() => handleMobileMenuToggle(false)} className="w-full">
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
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Link
                          to="/profile"
                          onClick={() => handleMobileMenuToggle(false)}
                          className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                          aria-label="Go to profile page"
                        >
                          <User className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                          <span className="text-base">Profile</span>
                        </Link>

                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={() => handleMobileMenuToggle(false)}
                            className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
                            aria-label="Go to admin dashboard"
                          >
                            <Shield className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
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
                          <LogOut className="h-5 w-5 text-destructive flex-shrink-0" aria-hidden="true" />
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
                        <Button className="w-full h-12 text-base touch-target">Sign In</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Desktop User Actions */}
            <div className="hidden lg:flex items-center gap-2">
              <ThemeToggle />
              <SubmitEventButton />
              <AdvertiseButton />
              {isAuthenticated ? (
                <>
                  {isAdmin && (
                    <Link to="/admin" aria-label="Go to admin dashboard">
                      <Button
                        variant="outline"
                        size="sm"
                        className="touch-target"
                      >
                        <Shield className="h-4 w-4 mr-2" aria-hidden="true" />
                        Admin
                      </Button>
                    </Link>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="relative touch-target rounded-full"
                        aria-label={`Account menu for ${profile?.first_name || 'User'}`}
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
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild role="none">
                        <Link to="/profile" className="flex items-center" role="menuitem" aria-label="Go to profile page">
                          <User className="mr-2 h-4 w-4" aria-hidden="true" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link to="/gamification" className="flex items-center" role="menuitem" aria-label="Go to level up page">
                          <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />
                          Level Up
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link to="/social" className="flex items-center" role="menuitem" aria-label="Go to social page">
                          <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                          Social
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild role="none">
                        <Link to="/calendar" className="flex items-center" role="menuitem" aria-label="Go to smart calendar page">
                          <Calendar className="mr-2 h-4 w-4" aria-hidden="true" />
                          Smart Calendar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} role="menuitem" aria-label="Sign out of your account">
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

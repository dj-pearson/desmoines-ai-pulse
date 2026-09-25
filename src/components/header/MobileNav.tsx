import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Menu,
  X,
  ChevronRight,
  Crown,
  User,
  CalendarCheck,
  Settings,
  Shield,
  LogOut,
  Trophy,
  Plus,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { navigationGroups, signInHref } from "./navigationConfig";
import { MemberUpgradeGate } from "./UserMenu";

interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  swipeRef: React.RefObject<HTMLDivElement>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Only the fields these menus render. Declared with `| null` rather than
   *  optional because the underlying profile columns are nullable — a row
   *  straight from the database has `first_name: string | null`, which does not
   *  satisfy `first_name?: string`. */
  profile: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  /** From useUserLevel: null until the query resolves, and when there is no
   *  reputation row. Level 0 is a real level, so test with `!= null`. */
  userLevel: number | null | undefined;
  userXP: number | null | undefined;
  onLogout: () => void;
  getInitials: () => string;
}

export function MobileNav({
  isOpen,
  onOpenChange,
  swipeRef,
  isAuthenticated,
  isAdmin,
  profile,
  userLevel,
  userXP,
  onLogout,
  getInitials,
}: MobileNavProps) {
  const location = useLocation();
  const signIn = signInHref(location.pathname, location.search);

  const isActivePath = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const handleLinkClick = () => {
    onOpenChange(false);
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden touch-feedback min-h-[44px] min-w-[44px] rounded-lg"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isOpen}
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
        hideClose
      >
        <SheetHeader className="flex-shrink-0 flex flex-row items-center justify-between">
          <SheetTitle className="text-xl">Menu</SheetTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="touch-feedback rounded-full h-11 w-11 p-0"
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
          <nav className="space-y-6" role="navigation" aria-label="Mobile navigation">
            {Object.values(navigationGroups).map((group) => (
              <NavSection
                key={group.label}
                title={group.label}
                icon={group.icon}
                items={group.items}
                isActivePath={isActivePath}
                onLinkClick={handleLinkClick}
              />
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
            {/* Upgrade CTA */}
            <MemberUpgradeGate isAuthenticated={isAuthenticated}>
              <Link
                to="/pricing"
                onClick={handleLinkClick}
                className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-xl min-h-[56px] smooth-transition"
              >
                <span className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">Upgrade to Premium</span>
                    <span className="block text-xs text-muted-foreground">Insider and VIP plans</span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </MemberUpgradeGate>
            {/* Plain links: /advertise is public, so a phone visitor reaches the
                rate card without the sign-in wall AdvertiseButton put first. */}
            <BusinessLink href="/submit-event" icon={Plus} label="Submit an event" onClick={handleLinkClick} />
            <BusinessLink href="/advertise" icon={Megaphone} label="Advertise with us" onClick={handleLinkClick} />
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
                  {userLevel != null && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full">
                        <Trophy className="h-3 w-3 text-primary" />
                        <span className="text-xs font-medium text-primary">Lvl {userLevel}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{userXP || 0} XP</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <UserLink href="/profile" icon={User} label="Profile" onClick={handleLinkClick} />
                <UserLink href="/my-events" icon={CalendarCheck} label="My Events" onClick={handleLinkClick} />
                <UserLink href="/dashboard" icon={Settings} label="Dashboard" onClick={handleLinkClick} />
                {isAdmin && (
                  <UserLink href="/admin" icon={Shield} label="Admin" onClick={handleLinkClick} />
                )}
                <button
                  onClick={() => {
                    onLogout();
                    handleLinkClick();
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
              <Button asChild className="w-full h-12 text-base touch-target">
                <Link to={signIn} onClick={handleLinkClick}>Sign In</Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface NavSectionProps {
  title: string;
  icon: React.ElementType;
  items: Array<{ href: string; label: string; icon: React.ElementType; featured?: boolean }>;
  isActivePath: (path: string) => boolean;
  onLinkClick: () => void;
}

function NavSection({ title, icon: Icon, items, isActivePath, onLinkClick }: NavSectionProps) {
  return (
    <div className="space-y-1">
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Icon className="h-3 w-3" />
          {title}
        </h3>
      </div>
      {items.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-3 p-4 rounded-xl touch-feedback min-h-[56px]",
            isActivePath(link.href)
              ? "bg-primary/10 text-primary border-2 border-primary/30 font-semibold"
              : "hover:bg-muted border-2 border-transparent",
            link.featured && "bg-primary/5"
          )}
          onMouseEnter={() => prefetchRoute(link.href)}
          onFocus={() => prefetchRoute(link.href)}
          aria-current={isActivePath(link.href) ? "page" : undefined}
        >
          <link.icon className="h-5 w-5 flex-shrink-0" />
          <span className="text-base font-medium">{link.label}</span>
          {link.featured && <ChevronRight className="h-4 w-4 ml-auto text-primary" />}
        </Link>
      ))}
    </div>
  );
}

interface UserLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}

function UserLink({ href, icon: Icon, label, onClick }: UserLinkProps) {
  return (
    <Link
      to={href}
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted smooth-transition touch-target"
      aria-label={`Go to ${label.toLowerCase()} page`}
    >
      <Icon className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
      <span className="text-base">{label}</span>
    </Link>
  );
}

function BusinessLink({ href, icon: Icon, label, onClick }: UserLinkProps) {
  return (
    <Link
      to={href}
      onClick={onClick}
      className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-xl min-h-[56px] smooth-transition"
    >
      <span className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
        <span className="font-medium">{label}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

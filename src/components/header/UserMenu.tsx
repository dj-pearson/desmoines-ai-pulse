import { Link, useLocation } from "react-router-dom";
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
  User,
  LogOut,
  Settings,
  Shield,
  CalendarCheck,
  Users,
  Trophy,
  Building2,
  Crown,
  Plus,
  Megaphone,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSubscription } from "@/hooks/useSubscription";
import { signInHref } from "./navigationConfig";

interface UserMenuProps {
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

export function UserMenu({
  isAuthenticated,
  isAdmin,
  profile,
  userLevel,
  userXP,
  onLogout,
  getInitials,
}: UserMenuProps) {
  const { pathname, search } = useLocation();
  return (
    <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
      <ThemeToggle />
      {isAuthenticated ? (
        <>
          {/* Upgrade CTA, only for members who are not already paying */}
          <MemberUpgradeGate isAuthenticated={isAuthenticated}>
            <Button asChild variant="secondary" size="sm" className="hidden xl:inline-flex font-semibold">
              <Link to="/pricing">
                <Crown className="h-3.5 w-3.5 mr-1.5 text-primary" aria-hidden="true" />
                Upgrade
              </Link>
            </Button>
          </MemberUpgradeGate>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative touch-target rounded-full"
                aria-label={`Account menu for ${profile?.first_name || "User"}`}
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
              sideOffset={8}
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
                  {userLevel != null && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full">
                        <Trophy className="h-3 w-3 text-primary" />
                        <span className="text-xs font-medium text-primary">Level {userLevel}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{userXP || 0} XP</span>
                    </div>
                  )}
                </div>
              </div>
              <DropdownMenuSeparator />
              <MenuLink href="/profile" icon={User} label="Profile" />
              <MenuLink href="/my-events" icon={CalendarCheck} label="My Events" />
              <MenuLink href="/dashboard" icon={Settings} label="Dashboard" />
              <MenuLink href="/gamification" icon={Trophy} label="Level Up" />
              <MenuLink href="/social" icon={Users} label="Social" />
              <DropdownMenuSeparator />
              {/* Plain menu items rather than buttons wrapped in an item, so
                  arrow keys reach them like every other entry. */}
              <MenuLink href="/submit-event" icon={Plus} label="Submit Event" />
              <MenuLink href="/advertise" icon={Megaphone} label="Advertise with Us" />
              <DropdownMenuSeparator />
              <MemberUpgradeGate isAuthenticated={isAuthenticated}>
                <MenuLink href="/pricing" icon={Crown} label="Upgrade to Premium" />
              </MemberUpgradeGate>
              <MenuLink href="/business" icon={Building2} label="Business Portal" />
              {isAdmin && <MenuLink href="/admin" icon={Shield} label="Admin" />}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} aria-label="Sign out of your account">
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <Button asChild className="touch-target">
          {/* The name keeps its visible words first (label in name) and stays
              distinct from a page's own "Sign in" link. */}
          <Link to={signInHref(pathname, search)} aria-label="Sign in to your account">
            Sign In
          </Link>
        </Button>
      )}
    </div>
  );
}

interface MenuLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
}

function MenuLink({ href, icon: Icon, label }: MenuLinkProps) {
  return (
    <DropdownMenuItem asChild>
      <Link
        to={href}
        className="flex items-center"
        aria-label={`Go to ${label.toLowerCase()} page`}
      >
        <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

interface MemberUpgradeGateProps {
  isAuthenticated: boolean;
  children: React.ReactNode;
}

/**
 * Renders an upgrade prompt only to people who could act on it. Anonymous
 * visitors always see it; a signed-in member sees it once their subscription
 * has loaded and it is free tier. Insider and VIP members used to be asked to
 * upgrade on every page.
 */
export function MemberUpgradeGate({ isAuthenticated, children }: MemberUpgradeGateProps) {
  if (!isAuthenticated) return <>{children}</>;
  return <PaidTierCheck>{children}</PaidTierCheck>;
}

/** Split out so useSubscription only runs for signed-in visitors. */
function PaidTierCheck({ children }: { children: React.ReactNode }) {
  const { isPremium, subscriptionLoading } = useSubscription();
  if (subscriptionLoading || isPremium) return null;
  return <>{children}</>;
}

import { Link } from "react-router-dom";
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
  Calendar,
  CalendarCheck,
  Users,
  Trophy,
  Building2,
  Crown,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdvertiseButton } from "@/components/AdvertiseButton";
import SubmitEventButton from "@/components/SubmitEventButton";

interface UserMenuProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  profile: { first_name?: string; last_name?: string; email?: string } | null;
  userLevel: number | null;
  userXP: number | null;
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
  return (
    <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
      <ThemeToggle />
      <SubmitEventButton />
      <AdvertiseButton />
      {isAuthenticated ? (
        <>
          {/* Upgrade CTA for logged-in users */}
          <Link to="/pricing" className="hidden xl:block">
            <Button
              variant="outline"
              size="sm"
              className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 hover:border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              Upgrade
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative touch-target rounded-full"
                aria-label={`Account menu for ${profile?.first_name || "User"}`}
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
              <DropdownMenuItem asChild role="none">
                <Link
                  to="/pricing"
                  className="flex items-center text-amber-600 dark:text-amber-400"
                  role="menuitem"
                  aria-label="View premium plans"
                >
                  <Crown className="mr-2 h-4 w-4" aria-hidden="true" />
                  Upgrade to Premium
                  <Sparkles className="ml-auto h-3 w-3" aria-hidden="true" />
                </Link>
              </DropdownMenuItem>
              <MenuLink href="/calendar" icon={Calendar} label="Smart Calendar" />
              <MenuLink href="/business" icon={Building2} label="Business Portal" />
              {isAdmin && <MenuLink href="/admin" icon={Shield} label="Admin" />}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} role="menuitem" aria-label="Sign out of your account">
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
  );
}

interface MenuLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
}

function MenuLink({ href, icon: Icon, label }: MenuLinkProps) {
  return (
    <DropdownMenuItem asChild role="none">
      <Link
        to={href}
        className="flex items-center"
        role="menuitem"
        aria-label={`Go to ${label.toLowerCase()} page`}
      >
        <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

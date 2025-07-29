import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Link } from "react-router-dom";
import { User, LogOut, Settings, Shield, Menu, Calendar, MapPin, Camera, Gamepad2 } from "lucide-react";
import { AdvertiseButton } from "./AdvertiseButton";
import SubmitEventButton from "./SubmitEventButton";

export default function Header() {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const { profile } = useProfile();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return "U";
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
          {/* Logo - Mobile Optimized */}
          <Link to="/" className="flex items-center smooth-transition hover:opacity-80">
            <img 
              src="/DMI-Logo-Header.png" 
              alt="Des Moines Insider" 
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-6">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary smooth-transition touch-target"
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu + User Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden touch-target"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[350px]">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col space-y-4 mt-6">
                  {navigationLinks.map((link) => (
                    <Link
                      key={link.href}
                      to={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted smooth-transition touch-target"
                    >
                      <link.icon className="h-5 w-5 text-primary" />
                      <span className="text-mobile-body font-medium">{link.label}</span>
                    </Link>
                  ))}
                  
                  {/* Mobile Submit Event and Advertise Buttons */}
                  <div className="border-t pt-4 mt-4 space-y-2">
                    <div onClick={() => setIsMobileMenuOpen(false)}>
                      <SubmitEventButton />
                    </div>
                    <div onClick={() => setIsMobileMenuOpen(false)}>
                      <AdvertiseButton />
                    </div>
                  </div>
                  
                  {/* Mobile User Actions */}
                  {isAuthenticated ? (
                    <>
                      <div className="border-t pt-4 mt-6">
                        <div className="flex items-center gap-3 p-3 mb-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {getInitials()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            {profile && (
                              <p className="font-medium text-sm">
                                {profile.first_name} {profile.last_name}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">
                              {profile?.email}
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Link
                            to="/profile"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted smooth-transition touch-target"
                          >
                            <User className="h-5 w-5" />
                            <span className="text-mobile-body">Profile</span>
                          </Link>
                          
                          {isAdmin && (
                            <Link
                              to="/admin"
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted smooth-transition touch-target"
                            >
                              <Shield className="h-5 w-5" />
                              <span className="text-mobile-body">Admin</span>
                            </Link>
                          )}
                          
                          <button
                            onClick={() => {
                              handleLogout();
                              setIsMobileMenuOpen(false);
                            }}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted smooth-transition touch-target w-full text-left"
                          >
                            <LogOut className="h-5 w-5" />
                            <span className="text-mobile-body">Sign out</span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="border-t pt-4 mt-6">
                      <Link
                        to="/auth"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block"
                      >
                        <Button className="w-full touch-target">Sign In</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Desktop User Actions */}
            <div className="hidden lg:flex items-center gap-3">
              <SubmitEventButton />
              <AdvertiseButton />
              {isAuthenticated ? (
                <>
                  {isAdmin && (
                    <Link to="/admin">
                      <Button variant="outline" size="sm" className="touch-target">
                        <Shield className="h-4 w-4 mr-2" />
                        Admin
                      </Button>
                    </Link>
                  )}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative touch-target rounded-full">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {getInitials()}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
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
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center">
                          <User className="mr-2 h-4 w-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Link to="/auth">
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

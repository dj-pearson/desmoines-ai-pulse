import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Bot,
  Wrench,
  TrendingUp,
  Shield,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: BarChart3 },
  { label: "Content", href: "/admin/content", icon: FileText },
  { label: "AI Tools", href: "/admin/ai", icon: Bot },
  { label: "Site Tools", href: "/admin/tools", icon: Wrench },
  { label: "Analytics", href: "/admin/analytics-dashboard", icon: TrendingUp },
  { label: "Security", href: "/admin/security", icon: Shield },
  { label: "System", href: "/admin/system", icon: Settings },
];

export default function AdminNav() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold hidden sm:inline">Admin</span>
        </div>

        <div className="flex-1 overflow-x-auto mx-4">
          <div className="flex items-center gap-1 min-w-max">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <Link to="/" className="flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Site</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
}

import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldX, Crown } from "lucide-react";
import { UserRole } from "@/hooks/useUserRole";

interface SecurityBadgeProps {
  role: UserRole;
  className?: string;
}

export function SecurityBadge({ role, className = "" }: SecurityBadgeProps) {
  const roleConfig = {
    root_admin: {
      icon: Crown,
      label: "Root Admin",
      variant: "default" as const,
      className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
    },
    admin: {
      icon: ShieldCheck,
      label: "Admin",
      variant: "destructive" as const,
      className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
    },
    moderator: {
      icon: Shield,
      label: "Moderator",
      variant: "secondary" as const,
      className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700",
    },
    user: {
      icon: ShieldX,
      label: "User",
      variant: "outline" as const,
      className: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600",
    },
  };

  const config = roleConfig[role] || roleConfig.user;
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${className} flex items-center gap-1`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
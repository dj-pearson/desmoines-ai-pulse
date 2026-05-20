import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Inbox,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdminActivityEntry } from "@/hooks/useAdminHomeStats";

interface AdminActivityFeedProps {
  entries: AdminActivityEntry[] | undefined;
  isLoading: boolean;
  /** When true, only render the first N entries (default desktop = all). */
  mobileLimit?: number;
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  rate_limit: "Rate limit",
  auth_failure: "Auth failure",
  validation_error: "Validation error",
  suspicious_activity: "Suspicious activity",
  admin_action: "Admin action",
};

const SEVERITY_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  high: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

function eventIcon(eventType: string, severity: string) {
  if (eventType === "admin_action") return Sparkles;
  if (eventType === "auth_failure") return Lock;
  if (severity === "high") return ShieldAlert;
  if (eventType === "validation_error") return AlertTriangle;
  return ShieldCheck;
}

function formatActionLabel(entry: AdminActivityEntry) {
  if (entry.action && entry.resource) return `${entry.action} · ${entry.resource}`;
  if (entry.action) return entry.action;
  if (entry.resource) return entry.resource;
  return EVENT_TYPE_LABEL[entry.event_type] ?? entry.event_type;
}

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const Icon = eventIcon(entry.event_type, entry.severity);
  const when = (() => {
    try {
      return formatDistanceToNow(new Date(entry.timestamp), {
        addSuffix: true,
      });
    } catch {
      return entry.timestamp;
    }
  })();

  return (
    <li className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div
        className={cn(
          "flex-shrink-0 mt-0.5 h-7 w-7 rounded-full flex items-center justify-center",
          SEVERITY_TONE[entry.severity] ?? SEVERITY_TONE.low,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium truncate">
            {formatActionLabel(entry)}
          </div>
          <Badge variant="outline" className="text-[10px] flex-shrink-0">
            {EVENT_TYPE_LABEL[entry.event_type] ?? entry.event_type}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{when}</div>
      </div>
    </li>
  );
}

function ActivitySkeleton() {
  return (
    <li className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <Skeleton className="h-7 w-7 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </li>
  );
}

export function AdminActivityFeed({
  entries,
  isLoading,
  mobileLimit = 10,
}: AdminActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Recent activity
        </CardTitle>
        <CardDescription className="text-xs">
          Last 20 admin and security events
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <ul className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <ActivitySkeleton key={i} />
            ))}
          </ul>
        ) : !entries || entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No recent activity.
          </div>
        ) : (
          <>
            <ul className="hidden sm:block divide-y -my-1">
              {entries.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
            <ul className="sm:hidden divide-y -my-1">
              {entries.slice(0, mobileLimit).map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
            {entries.length > mobileLimit && (
              <div className="sm:hidden pt-3 text-center">
                <Link
                  to="/admin/security"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all in security audit log
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

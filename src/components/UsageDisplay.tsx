import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsage, UsageEventType } from "@/hooks/useUsage";
import { Sparkles, Mail, FileText, Zap, AlertTriangle } from "lucide-react";

interface UsageDisplayProps {
  showDetails?: boolean;
  compact?: boolean;
}

const eventTypeConfig: Record<
  UsageEventType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  ai_generation: {
    label: "AI Generations",
    icon: <Sparkles className="h-4 w-4" />,
    color: "text-purple-500",
  },
  email_sent: {
    label: "Emails Sent",
    icon: <Mail className="h-4 w-4" />,
    color: "text-blue-500",
  },
  api_call: {
    label: "API Calls",
    icon: <Zap className="h-4 w-4" />,
    color: "text-yellow-500",
  },
  report_generated: {
    label: "Reports",
    icon: <FileText className="h-4 w-4" />,
    color: "text-green-500",
  },
  sms_sent: {
    label: "SMS Sent",
    icon: <Mail className="h-4 w-4" />,
    color: "text-teal-500",
  },
  export_created: {
    label: "Exports",
    icon: <FileText className="h-4 w-4" />,
    color: "text-orange-500",
  },
  custom: {
    label: "Custom",
    icon: <Zap className="h-4 w-4" />,
    color: "text-gray-500",
  },
};

export function UsageDisplay({ showDetails = false, compact = false }: UsageDisplayProps) {
  const { currentUsage, isLoading, getTotalOverageCost } = useUsage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (currentUsage.length === 0) {
    return null; // No usage quotas defined
  }

  const totalOverage = getTotalOverageCost();

  if (compact) {
    return (
      <div className="space-y-3">
        {currentUsage.map((quota) => {
          const config = eventTypeConfig[quota.event_type];
          const percentage =
            quota.monthly_limit !== null
              ? Math.min(100, (quota.total_quantity / quota.monthly_limit) * 100)
              : 0;
          const isNearLimit = percentage >= 80;
          const isAtLimit = percentage >= 100;

          return (
            <div key={quota.event_type} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={config.color}>{config.icon}</span>
                  {config.label}
                </span>
                <span className="text-muted-foreground">
                  {quota.monthly_limit === null ? (
                    <Badge variant="outline" className="text-xs">
                      Unlimited
                    </Badge>
                  ) : (
                    <>
                      {quota.total_quantity} / {quota.monthly_limit}
                    </>
                  )}
                </span>
              </div>
              {quota.monthly_limit !== null && (
                <Progress
                  value={percentage}
                  className={`h-1.5 ${
                    isAtLimit
                      ? "[&>div]:bg-red-500"
                      : isNearLimit
                        ? "[&>div]:bg-yellow-500"
                        : ""
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Usage This Period</CardTitle>
            <CardDescription>Your current usage and limits</CardDescription>
          </div>
          {totalOverage > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              ${totalOverage.toFixed(2)} overage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentUsage.map((quota) => {
          const config = eventTypeConfig[quota.event_type];
          const percentage =
            quota.monthly_limit !== null
              ? Math.min(100, (quota.total_quantity / quota.monthly_limit) * 100)
              : 0;
          const isNearLimit = percentage >= 80;
          const isAtLimit = percentage >= 100;

          return (
            <div key={quota.event_type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={config.color}>{config.icon}</span>
                  <span className="font-medium">{config.label}</span>
                </div>
                <div className="text-right">
                  {quota.monthly_limit === null ? (
                    <Badge variant="outline">Unlimited</Badge>
                  ) : (
                    <>
                      <span
                        className={`font-bold ${
                          isAtLimit
                            ? "text-red-500"
                            : isNearLimit
                              ? "text-yellow-600"
                              : ""
                        }`}
                      >
                        {quota.total_quantity}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {quota.monthly_limit}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {quota.monthly_limit !== null && (
                <Progress
                  value={percentage}
                  className={`h-2 ${
                    isAtLimit
                      ? "[&>div]:bg-red-500"
                      : isNearLimit
                        ? "[&>div]:bg-yellow-500"
                        : ""
                  }`}
                />
              )}

              {showDetails && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {quota.included_units} included
                    {quota.overage_quantity > 0 && (
                      <span className="text-yellow-600 ml-2">
                        +{quota.overage_quantity} overage
                      </span>
                    )}
                  </span>
                  {quota.overage_cost > 0 && (
                    <span className="text-red-500">
                      ${quota.overage_cost.toFixed(2)} extra
                    </span>
                  )}
                </div>
              )}

              {isNearLimit && !isAtLimit && (
                <p className="text-xs text-yellow-600">
                  You're approaching your limit. Consider upgrading for more.
                </p>
              )}
              {isAtLimit && (
                <p className="text-xs text-red-500">
                  You've reached your limit. Upgrade for more or wait for next
                  period.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Compact usage indicator for headers/nav
 */
export function UsageIndicator({ eventType }: { eventType: UsageEventType }) {
  const { getUsageByType, isLoading } = useUsage();
  const quota = getUsageByType(eventType);
  const config = eventTypeConfig[eventType];

  if (isLoading || !quota) return null;
  if (quota.monthly_limit === null) return null; // Don't show for unlimited

  const percentage = (quota.total_quantity / quota.monthly_limit) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div
      className={`flex items-center gap-1 text-xs ${
        isAtLimit
          ? "text-red-500"
          : isNearLimit
            ? "text-yellow-600"
            : "text-muted-foreground"
      }`}
      title={`${config.label}: ${quota.total_quantity}/${quota.monthly_limit}`}
    >
      {config.icon}
      <span>
        {quota.total_quantity}/{quota.monthly_limit}
      </span>
    </div>
  );
}

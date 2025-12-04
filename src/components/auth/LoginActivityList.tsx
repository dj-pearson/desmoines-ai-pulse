import { useState } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLoginActivity } from "@/hooks/useLoginActivity";

interface LoginActivityListProps {
  maxItems?: number;
  showStats?: boolean;
  className?: string;
}

export function LoginActivityList({
  maxItems = 10,
  showStats = true,
  className,
}: LoginActivityListProps) {
  const {
    loginHistory,
    isLoadingHistory,
    refetchHistory,
    getLoginStats,
    checkSuspiciousActivity,
    formatActivity,
  } = useLoginActivity();

  const [isExpanded, setIsExpanded] = useState(false);

  const stats = getLoginStats();
  const suspiciousCheck = checkSuspiciousActivity();

  const displayedHistory = isExpanded
    ? loginHistory.slice(0, maxItems * 2)
    : loginHistory.slice(0, maxItems);

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      case 'desktop':
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (success: boolean) => {
    if (success) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
          <Check className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
        <X className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  };

  const getRiskBadge = (riskLevel: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'high':
        return (
          <Badge variant="destructive" className="text-xs">
            High Risk
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">
            Medium Risk
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoadingHistory) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Login Activity</CardTitle>
          <CardDescription>Loading your login history...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Login Activity
          </CardTitle>
          <CardDescription>
            Your recent login attempts and security events
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetchHistory()}
          className="flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Suspicious Activity Alert */}
        {suspiciousCheck.suspicious && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-red-800">Suspicious Activity Detected</h4>
              <ul className="mt-1 text-sm text-red-700 space-y-1">
                {suspiciousCheck.reasons.map((reason, index) => (
                  <li key={index}>- {reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        {showStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalLogins}</div>
              <div className="text-xs text-gray-500">Total Logins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.successfulLogins}</div>
              <div className="text-xs text-gray-500">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.failedLogins}</div>
              <div className="text-xs text-gray-500">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.uniqueDevices}</div>
              <div className="text-xs text-gray-500">Devices</div>
            </div>
          </div>
        )}

        {/* Activity List */}
        {loginHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Globe className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No login activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedHistory.map(activity => {
              const formatted = formatActivity(activity);
              return (
                <div
                  key={activity.id}
                  className={cn(
                    "flex items-start gap-4 p-3 rounded-lg border transition-colors",
                    activity.success
                      ? "bg-white hover:bg-gray-50"
                      : "bg-red-50 border-red-100"
                  )}
                >
                  {/* Device Icon */}
                  <div
                    className={cn(
                      "p-2 rounded-full",
                      activity.success ? "bg-gray-100" : "bg-red-100"
                    )}
                  >
                    {getDeviceIcon(activity.device_type)}
                  </div>

                  {/* Activity Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatted.title}</span>
                      {getStatusBadge(activity.success)}
                      {getRiskBadge(formatted.riskLevel)}
                      {activity.mfa_verified && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
                          MFA
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 truncate">
                      {formatted.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatted.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Show More/Less */}
        {loginHistory.length > maxItems && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show More ({loginHistory.length - maxItems} more)
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

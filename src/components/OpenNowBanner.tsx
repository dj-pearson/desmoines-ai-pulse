import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, Utensils, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface OpenNowBannerProps {
  isActive: boolean;
  onToggle: () => void;
  openCount?: number;
  totalCount?: number;
  className?: string;
}

export function OpenNowBanner({
  isActive,
  onToggle,
  openCount,
  totalCount,
  className,
}: OpenNowBannerProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 11) return "Looking for breakfast?";
    if (hour < 15) return "Ready for lunch?";
    if (hour < 18) return "Planning dinner?";
    return "Evening dining?";
  };

  return (
    <Card
      className={cn(
        "border-2 transition-all duration-300",
        isActive
          ? "border-green-500 bg-green-50 dark:bg-green-950/20 shadow-lg shadow-green-500/20"
          : "border-border hover:border-green-300",
        className
      )}
    >
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left side - Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Clock
                  className={cn(
                    "h-6 w-6",
                    isActive ? "text-green-600" : "text-primary"
                  )}
                />
                {isActive && (
                  <div className="absolute -top-1 -right-1">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold">
                {isActive ? "Showing Open Now" : getGreeting()}
              </h3>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant="secondary"
                className={cn(
                  "text-sm font-semibold",
                  isActive &&
                    "bg-green-600 text-white hover:bg-green-700 dark:bg-green-600"
                )}
              >
                <Utensils className="h-4 w-4 mr-1" />
                {openCount !== undefined
                  ? `${openCount} restaurants open`
                  : "Filter by open restaurants"}
              </Badge>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Current time: {formatTime(currentTime)}</span>
              </div>
            </div>

            {!isActive && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                Find restaurants currently serving. Perfect for last-minute
                dining decisions!
              </p>
            )}

            {isActive && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-green-700 dark:text-green-400 font-medium">
                  Showing only restaurants open right now
                </span>
              </div>
            )}
          </div>

          {/* Right side - CTA */}
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              onClick={onToggle}
              className={cn(
                "transition-all duration-300",
                isActive
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {isActive ? (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Showing Open
                </>
              ) : (
                <>
                  <Clock className="h-5 w-5 mr-2" />
                  Show Open Now
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {isActive && openCount !== undefined && totalCount !== undefined && (
          <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {openCount} of {totalCount} total restaurants
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (openCount / totalCount) * 100
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {Math.round((openCount / totalCount) * 100)}% open
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Compact version for mobile
export function OpenNowButton({
  isActive,
  onToggle,
  openCount,
}: {
  isActive: boolean;
  onToggle: () => void;
  openCount?: number;
}) {
  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="lg"
      onClick={onToggle}
      className={cn(
        "w-full md:w-auto transition-all duration-300 relative",
        isActive &&
          "bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse"
      )}
    >
      <Clock className="h-5 w-5 mr-2" />
      {isActive ? (
        <>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Open Now Active
        </>
      ) : (
        <>
          Open Now
          {openCount !== undefined && ` (${openCount})`}
        </>
      )}
      {isActive && (
        <div className="absolute -top-1 -right-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-300"></span>
          </span>
        </div>
      )}
    </Button>
  );
}

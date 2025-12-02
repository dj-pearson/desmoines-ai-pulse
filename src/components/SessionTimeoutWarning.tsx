import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionManager } from "@/hooks/useSessionManager";
import { Clock } from "lucide-react";

interface SessionTimeoutWarningProps {
  /** Minutes of inactivity before showing warning (default: 25) */
  inactivityMinutes?: number;
  /** Whether to enable the warning (default: true) */
  enabled?: boolean;
}

/**
 * Session Timeout Warning Component
 *
 * Displays a warning dialog when the user's session is about to expire
 * due to inactivity. Allows the user to extend their session or log out.
 */
export function SessionTimeoutWarning({
  inactivityMinutes = 25,
  enabled = true,
}: SessionTimeoutWarningProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const { isAuthenticated, logout } = useAuth();

  const { refreshSession, resetActivityTimer } = useSessionManager({
    inactivityWarningMinutes: inactivityMinutes,
    onSessionWarning: () => {
      if (enabled) {
        setShowWarning(true);
        setCountdown(300);
      }
    },
    onSessionRefreshed: () => {
      setShowWarning(false);
    },
  });

  // Countdown timer when warning is shown
  useEffect(() => {
    if (!showWarning) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Session expired, log out
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showWarning, logout]);

  const handleExtendSession = async () => {
    const success = await refreshSession();
    if (success) {
      resetActivityTimer();
      setShowWarning(false);
    }
  };

  const handleLogout = () => {
    setShowWarning(false);
    logout();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isAuthenticated || !enabled) {
    return null;
  }

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Session Timeout Warning
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Your session will expire due to inactivity.
            </p>
            <p className="text-2xl font-bold text-center py-4 text-foreground">
              {formatTime(countdown)}
            </p>
            <p>
              Would you like to extend your session?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLogout}>
            Log Out
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleExtendSession}>
            Stay Signed In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

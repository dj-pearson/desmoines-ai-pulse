import { useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, AlertTriangle } from 'lucide-react';

interface SessionTimeoutWarningProps {
  open: boolean;
  timeRemaining: number;
  onStayLoggedIn: () => void;
}

/**
 * Session Timeout Warning Dialog
 *
 * Displays a warning when the user's session is about to expire due to inactivity
 * Shows a countdown timer and allows the user to extend their session
 */
export function SessionTimeoutWarning({ open, timeRemaining, onStayLoggedIn }: SessionTimeoutWarningProps) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  // Auto-dismiss on any keyboard or mouse event
  useEffect(() => {
    if (!open) return;

    const handleActivity = () => {
      onStayLoggedIn();
    };

    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);

    return () => {
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
    };
  }, [open, onStayLoggedIn]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Session Expiring Soon
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire due to inactivity. You'll be automatically logged out to protect your account.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <Alert className="border-orange-200 bg-orange-50">
            <Clock className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-900">
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm font-medium">Time remaining:</span>
                <span className="text-3xl font-mono font-bold">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
              </div>
            </AlertDescription>
          </Alert>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Click the button below to stay logged in</p>
            <p>• Move your mouse or press any key to extend your session</p>
            <p>• Your work will be saved before logout</p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onStayLoggedIn}>
            Stay Logged In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { SessionTimeoutWarning } from './SessionTimeoutWarning';

/**
 * Session Manager Component
 *
 * Handles session timeout monitoring and warning display
 * Should be placed inside AuthProvider to access auth context
 */
export function SessionManager() {
  const { isWarning, timeRemaining, resetTimer } = useSessionTimeout({
    idleTimeout: 30,  // 30 minutes of inactivity
    warningTime: 5,   // 5 minutes warning before logout
    maxSessionDuration: 8,  // 8 hours maximum session
    enabled: true,
  });

  return (
    <SessionTimeoutWarning
      open={isWarning}
      timeRemaining={timeRemaining}
      onStayLoggedIn={resetTimer}
    />
  );
}

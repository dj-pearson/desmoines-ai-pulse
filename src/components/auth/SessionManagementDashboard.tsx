import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Monitor, Smartphone, Tablet, MapPin, Clock, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createLogger } from '@/lib/logger';

const log = createLogger('SessionManagementDashboard');

interface Session {
  id: string;
  session_id: string;
  device_info: any;
  ip_address: string;
  user_agent: string;
  last_activity: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

/**
 * Session Management Dashboard Component
 *
 * Allows users to:
 * - View all active sessions
 * - See device and location information
 * - Revoke individual sessions
 * - Revoke all other sessions
 * - View session activity
 */
export function SessionManagementDashboard() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [showRevokeAllDialog, setShowRevokeAllDialog] = useState(false);

  // Load sessions
  useEffect(() => {
    if (!user) return;
    loadSessions();
  }, [user]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('last_activity', { ascending: false });

      if (error) throw error;

      setSessions(data || []);
    } catch (error) {
      log.error('loadSessions', 'Error loading sessions', { data: error });
      toast({
        title: 'Failed to Load Sessions',
        description: 'Could not retrieve your active sessions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      const { error } = await supabase.rpc('revoke_session', {
        p_session_id: sessionId,
      });

      if (error) throw error;

      toast({
        title: 'Session Revoked',
        description: 'The session has been successfully terminated',
      });

      await loadSessions();
    } catch (error) {
      log.error('revokeSession', 'Error revoking session', { data: error });
      toast({
        title: 'Revoke Failed',
        description: 'Could not revoke the session',
        variant: 'destructive',
      });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const revokeAllOtherSessions = async () => {
    if (!session?.access_token) return;

    try {
      const currentSessionId = session.access_token.substring(0, 16); // Simple session ID extraction

      const { data, error } = await supabase.rpc('revoke_all_other_sessions', {
        p_current_session_id: currentSessionId,
      });

      if (error) throw error;

      toast({
        title: 'Sessions Revoked',
        description: `${data || 0} session(s) have been terminated`,
      });

      setShowRevokeAllDialog(false);
      await loadSessions();
    } catch (error) {
      log.error('revokeAllSessions', 'Error revoking sessions', { data: error });
      toast({
        title: 'Revoke Failed',
        description: 'Could not revoke other sessions',
        variant: 'destructive',
      });
    }
  };

  const getDeviceIcon = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return <Tablet className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const getDeviceName = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile')) return 'Mobile Device';
    if (ua.includes('tablet')) return 'Tablet';
    if (ua.includes('windows')) return 'Windows PC';
    if (ua.includes('mac')) return 'Mac';
    if (ua.includes('linux')) return 'Linux PC';
    return 'Unknown Device';
  };

  const getBrowserName = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    return 'Unknown Browser';
  };

  const isCurrentSession = (sessionId: string) => {
    if (!session?.access_token) return false;
    const currentSessionId = session.access_token.substring(0, 16);
    return sessionId.includes(currentSessionId);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Active Sessions
              </CardTitle>
              <CardDescription>
                Manage devices and locations where you're signed in
              </CardDescription>
            </div>

            {sessions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRevokeAllDialog(true)}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out All Others
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active sessions found</p>
              <p className="text-xs mt-1">
                Sessions are automatically tracked when you sign in
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((sess) => {
                const isCurrent = isCurrentSession(sess.session_id);

                return (
                  <div
                    key={sess.id}
                    className={`flex items-start justify-between p-4 border rounded-lg ${
                      isCurrent ? 'bg-primary/5 border-primary/30' : 'bg-background'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      {getDeviceIcon(sess.user_agent)}

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{getDeviceName(sess.user_agent)}</p>
                          {isCurrent && (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Current
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {getBrowserName(sess.user_agent)}
                        </p>

                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                          {sess.ip_address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {sess.ip_address}
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last active {formatDistanceToNow(new Date(sess.last_activity), { addSuffix: true })}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Signed in {formatDistanceToNow(new Date(sess.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeSession(sess.session_id)}
                      disabled={revokingSessionId === sess.session_id || isCurrent}
                      title={isCurrent ? 'Cannot revoke current session' : 'Sign out this device'}
                    >
                      {revokingSessionId === sess.session_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <Alert>
            <AlertDescription className="text-xs">
              <strong>Security Tip:</strong> If you see a session you don't recognize, sign it out immediately and change your password.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Revoke All Dialog */}
      <AlertDialog open={showRevokeAllDialog} onOpenChange={setShowRevokeAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out All Other Sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign you out of all devices except this one. You'll need to sign in again on those devices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revokeAllOtherSessions} className="bg-destructive text-destructive-foreground">
              Sign Out All Others
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

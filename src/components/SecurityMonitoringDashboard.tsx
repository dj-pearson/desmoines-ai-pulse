import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string; // Changed from union type to string
  timestamp: string;
  details: any;
  ip_address?: string;
  resource?: string;
  action?: string;
}

interface FailedAttempt {
  id: string;
  email: string;
  attempt_type: string;
  error_message: string;
  created_at: string;
  ip_address?: string;
}

export function SecurityMonitoringDashboard() {
  const { user, isAdmin } = useAuth();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [failedAttempts, setFailedAttempts] = useState<FailedAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const fetchSecurityData = async () => {
      try {
        // Fetch recent security events
        const { data: events, error: eventsError } = await supabase
          .from('security_audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (eventsError) {
          console.error('Failed to fetch security events:', eventsError);
        } else {
          setSecurityEvents(events || []);
        }

        // Fetch recent failed attempts
        const { data: attempts, error: attemptsError } = await supabase
          .from('failed_auth_attempts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (attemptsError) {
          console.error('Failed to fetch failed attempts:', attemptsError);
        } else {
          setFailedAttempts(attempts || []);
        }
      } catch (error) {
        console.error('Error fetching security data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSecurityData();
  }, [user, isAdmin]);

  if (!user || !isAdmin) {
    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Admin privileges required to view security monitoring dashboard.
        </AlertDescription>
      </Alert>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="h-3 w-3" />;
      case 'medium': return <Activity className="h-3 w-3" />;
      default: return <Shield className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse">Loading security data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recent Security Events
          </CardTitle>
          <CardDescription>
            Security audit logs and system events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {securityEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No security events found</p>
          ) : (
            <div className="space-y-3">
              {securityEvents.map((event) => (
                <div key={event.id} className="flex items-start justify-between p-3 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Badge 
                      variant={getSeverityColor(event.severity) as any}
                      className="flex items-center gap-1"
                    >
                      {getSeverityIcon(event.severity)}
                      {event.severity}
                    </Badge>
                    <div>
                      <p className="font-medium">{event.event_type.replace(/_/g, ' ').toUpperCase()}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.resource && `Resource: ${event.resource}`}
                        {event.action && ` | Action: ${event.action}`}
                      </p>
                      {event.details && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(event.details, null, 2).slice(0, 200)}...
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                    {event.ip_address && (
                      <div className="text-xs mt-1">IP: {event.ip_address}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed Authentication Attempts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Failed Authentication Attempts
          </CardTitle>
          <CardDescription>
            Recent failed login and signup attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failedAttempts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No failed attempts found</p>
          ) : (
            <div className="space-y-3">
              {failedAttempts.map((attempt) => (
                <div key={attempt.id} className="flex items-start justify-between p-3 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Badge variant="destructive">
                      {attempt.attempt_type.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="font-medium">{attempt.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Error: {attempt.error_message}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(attempt.created_at).toLocaleString()}
                    </div>
                    {attempt.ip_address && (
                      <div className="text-xs mt-1">IP: {attempt.ip_address}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
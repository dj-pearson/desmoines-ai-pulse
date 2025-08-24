import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSecurityAudit } from '@/hooks/useSecurityAudit';
import { 
  Shield, 
  AlertTriangle, 
  Lock, 
  Eye, 
  TrendingUp, 
  Calendar,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

export default function SecurityDashboard() {
  const { 
    events, 
    loading, 
    error, 
    fetchSecurityEvents, 
    getSecurityStats 
  } = useSecurityAudit();

  const [stats, setStats] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [filters, setFilters] = useState({
    eventType: '',
    severity: '',
    startDate: '',
    endDate: '',
    userId: '',
  });

  useEffect(() => {
    fetchSecurityEvents();
    loadStats();
  }, []);

  const loadStats = async () => {
    const data = await getSecurityStats(timeRange);
    setStats(data);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchSecurityEvents(filters);
  };

  const exportEvents = () => {
    const csv = events.map(event => [
      event.timestamp,
      event.event_type,
      event.severity,
      event.identifier,
      event.endpoint || '',
      JSON.stringify(event.details),
    ].join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security_events_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'rate_limit': return <TrendingUp className="h-4 w-4" />;
      case 'auth_failure': return <Lock className="h-4 w-4" />;
      case 'validation_error': return <AlertTriangle className="h-4 w-4" />;
      case 'suspicious_activity': return <Eye className="h-4 w-4" />;
      case 'admin_action': return <Shield className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Security Dashboard</h2>
          <p className="text-muted-foreground">Monitor and analyze security events</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={loadStats} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Security Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                In the last {timeRange}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rate Limits</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.rateLimit}</div>
              <p className="text-xs text-muted-foreground">
                Blocked requests
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auth Failures</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.authFailures}</div>
              <p className="text-xs text-muted-foreground">
                Failed attempts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspicious Activity</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.suspiciousActivity}</div>
              <p className="text-xs text-muted-foreground">
                Flagged events
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security Events */}
      <Tabs defaultValue="events" className="w-full">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Select value={filters.eventType} onValueChange={(value) => handleFilterChange('eventType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    <SelectItem value="rate_limit">Rate Limit</SelectItem>
                    <SelectItem value="auth_failure">Auth Failure</SelectItem>
                    <SelectItem value="validation_error">Validation Error</SelectItem>
                    <SelectItem value="suspicious_activity">Suspicious Activity</SelectItem>
                    <SelectItem value="admin_action">Admin Action</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.severity} onValueChange={(value) => handleFilterChange('severity', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Severities</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  placeholder="Start Date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                />

                <Input
                  type="date"
                  placeholder="End Date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                />

                <Input
                  placeholder="User ID"
                  value={filters.userId}
                  onChange={(e) => handleFilterChange('userId', e.target.value)}
                />

                <div className="flex gap-2">
                  <Button onClick={applyFilters} className="flex-1">
                    Apply
                  </Button>
                  <Button onClick={exportEvents} variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Events</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading security events...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-600">Error: {error}</div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No security events found</div>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getEventTypeIcon(event.event_type)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{event.event_type.replace('_', ' ').toUpperCase()}</span>
                              <Badge variant={getSeverityColor(event.severity) as any}>
                                {event.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {event.endpoint && `${event.endpoint} • `}
                              Identifier: {event.identifier.substring(0, 8)}...
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {format(new Date(event.timestamp), 'MMM dd, HH:mm:ss')}
                          </p>
                          {event.details && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer">
                                View Details
                              </summary>
                              <pre className="text-xs mt-2 p-2 bg-muted rounded max-w-md overflow-auto">
                                {JSON.stringify(event.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Event Types Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Events by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.byType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getEventTypeIcon(type)}
                          <span className="capitalize">{type.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all"
                              style={{ width: `${((count as number) / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{count as number}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Severity Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Events by Severity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.bySeverity).map(([severity, count]) => (
                      <div key={severity} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            severity === 'high' ? 'bg-red-500' :
                            severity === 'medium' ? 'bg-orange-500' : 'bg-green-500'
                          }`} />
                          <span className="capitalize">{severity}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                severity === 'high' ? 'bg-red-500' :
                                severity === 'medium' ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${((count as number) / stats.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{count as number}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
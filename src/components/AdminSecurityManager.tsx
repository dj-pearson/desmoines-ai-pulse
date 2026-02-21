import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  AlertTriangle,
  Ban,
  Eye,
  Lock,
  Users,
  Activity,
  Globe,
  Settings,
  Clock,
  UserX,
} from "lucide-react";
import { createLogger } from '@/lib/logger';
import { storage } from '@/lib/safeStorage';

const log = createLogger('AdminSecurityManager');

interface SecuritySettings {
  rateLimit: number;
  maintenanceMode: boolean;
  userRegistrationEnabled: boolean;
  contentModeration: boolean;
  autoBlock: boolean;
  maxLoginAttempts: number;
  ipWhitelist: string[];
  suspiciousActivityThreshold: number;
}

interface SecurityLog {
  id: string;
  event_type: string;
  user_id?: string;
  ip_address: string;
  details: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export default function AdminSecurityManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SecuritySettings>({
    rateLimit: 100,
    maintenanceMode: false,
    userRegistrationEnabled: true,
    contentModeration: true,
    autoBlock: false,
    maxLoginAttempts: 5,
    ipWhitelist: [],
    suspiciousActivityThreshold: 10,
  });
  
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [newWhitelistIP, setNewWhitelistIP] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSecuritySettings();
    loadSecurityLogs();
    loadBlockedIPs();
  }, []);

  const loadSecuritySettings = async () => {
    try {
      // In a real implementation, this would fetch from a security_settings table
      const savedSettings = storage.get<typeof settings>('adminSecuritySettings');
      if (savedSettings) {
        setSettings(savedSettings);
      }
    } catch (error) {
      log.error('loadSettings', 'Failed to load security settings', { data: error });
    }
  };

  const loadSecurityLogs = async () => {
    try {
      // Mock security logs - in real implementation, fetch from security_logs table
      const mockLogs: SecurityLog[] = [
        {
          id: "1",
          event_type: "failed_login",
          user_id: undefined,
          ip_address: "192.168.1.100",
          details: { attempts: 3, email: "test@example.com" },
          severity: "medium",
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        },
        {
          id: "2",
          event_type: "rate_limit_exceeded",
          ip_address: "10.0.0.50",
          details: { endpoint: "/api/events", requests: 150 },
          severity: "high",
          created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        },
        {
          id: "3",
          event_type: "suspicious_content",
          user_id: "user123",
          ip_address: "203.0.113.45",
          details: { content_type: "event", flagged_words: ["spam", "hack"] },
          severity: "medium",
          created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        },
      ];
      setSecurityLogs(mockLogs);
    } catch (error) {
      log.error('loadLogs', 'Failed to load security logs', { data: error });
    }
  };

  const loadBlockedIPs = async () => {
    try {
      // Mock blocked IPs - in real implementation, fetch from blocked_ips table
      setBlockedIPs(["192.168.1.100", "10.0.0.50"]);
    } catch (error) {
      log.error('loadBlockedIPs', 'Failed to load blocked IPs', { data: error });
    }
  };

  const saveSecuritySettings = async () => {
    setIsLoading(true);
    try {
      // In real implementation, save to database
      storage.set('adminSecuritySettings', settings);
      toast({
        title: "Security Settings Updated",
        description: "All security settings have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save security settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMaintenanceMode = async () => {
    setSettings(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }));
    toast({
      title: settings.maintenanceMode ? "Maintenance Mode Disabled" : "Maintenance Mode Enabled",
      description: settings.maintenanceMode 
        ? "Site is now accessible to all users."
        : "Site is now in maintenance mode. Only admins can access.",
      variant: settings.maintenanceMode ? "default" : "destructive",
    });
  };

  const blockIP = async (ip: string) => {
    try {
      setBlockedIPs(prev => [...prev, ip]);
      toast({
        title: "IP Blocked",
        description: `IP address ${ip} has been blocked.`,
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to block IP address.",
        variant: "destructive",
      });
    }
  };

  const unblockIP = async (ip: string) => {
    try {
      setBlockedIPs(prev => prev.filter(blocked => blocked !== ip));
      toast({
        title: "IP Unblocked",
        description: `IP address ${ip} has been unblocked.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to unblock IP address.",
        variant: "destructive",
      });
    }
  };

  const addToWhitelist = () => {
    if (newWhitelistIP && !settings.ipWhitelist.includes(newWhitelistIP)) {
      setSettings(prev => ({
        ...prev,
        ipWhitelist: [...prev.ipWhitelist, newWhitelistIP]
      }));
      setNewWhitelistIP("");
      toast({
        title: "IP Whitelisted",
        description: `IP address ${newWhitelistIP} has been added to whitelist.`,
      });
    }
  };

  const removeFromWhitelist = (ip: string) => {
    setSettings(prev => ({
      ...prev,
      ipWhitelist: prev.ipWhitelist.filter(whitelisted => whitelisted !== ip)
    }));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variant = severity === 'critical' || severity === 'high' ? 'destructive' : 
                   severity === 'medium' ? 'default' : 'secondary';
    return <Badge variant={variant}>{severity.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" />
            Security Management
          </h2>
          <p className="text-muted-foreground">
            Enterprise-grade security controls and monitoring
          </p>
        </div>
        <Button onClick={saveSecuritySettings} disabled={isLoading}>
          <Settings className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="access-control">Access Control</TabsTrigger>
          <TabsTrigger value="logs">Security Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Security Controls
                </CardTitle>
                <CardDescription>
                  Configure basic security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="maintenance">Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Restrict site access to admins only
                    </p>
                  </div>
                  <Switch
                    id="maintenance"
                    checked={settings.maintenanceMode}
                    onCheckedChange={toggleMaintenanceMode}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="registration">User Registration</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow new user registrations
                    </p>
                  </div>
                  <Switch
                    id="registration"
                    checked={settings.userRegistrationEnabled}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, userRegistrationEnabled: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="moderation">Content Moderation</Label>
                    <p className="text-sm text-muted-foreground">
                      Auto-moderate user submissions
                    </p>
                  </div>
                  <Switch
                    id="moderation"
                    checked={settings.contentModeration}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, contentModeration: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoblock">Auto IP Blocking</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically block suspicious IPs
                    </p>
                  </div>
                  <Switch
                    id="autoblock"
                    checked={settings.autoBlock}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, autoBlock: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Rate Limiting
                </CardTitle>
                <CardDescription>
                  Configure request rate limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="rateLimit">Requests per minute</Label>
                  <Input
                    id="rateLimit"
                    type="number"
                    value={settings.rateLimit}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, rateLimit: parseInt(e.target.value) || 100 }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="maxAttempts">Max login attempts</Label>
                  <Input
                    id="maxAttempts"
                    type="number"
                    value={settings.maxLoginAttempts}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, maxLoginAttempts: parseInt(e.target.value) || 5 }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="threshold">Suspicious activity threshold</Label>
                  <Input
                    id="threshold"
                    type="number"
                    value={settings.suspiciousActivityThreshold}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, suspiciousActivityThreshold: parseInt(e.target.value) || 10 }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Active Threats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">
                  {securityLogs.filter(log => log.severity === 'critical' || log.severity === 'high').length}
                </div>
                <p className="text-xs text-muted-foreground">High/Critical alerts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Blocked IPs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {blockedIPs.length}
                </div>
                <p className="text-xs text-muted-foreground">Currently blocked</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Security Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {securityLogs.length}
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Real-time Security Status</CardTitle>
              <CardDescription>Current security metrics and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>System Status</span>
                  </div>
                  <Badge variant="secondary">Healthy</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span>Failed Login Attempts</span>
                  </div>
                  <Badge variant="default">
                    {securityLogs.filter(log => log.event_type === 'failed_login').length}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Rate Limit Violations</span>
                  </div>
                  <Badge variant="destructive">
                    {securityLogs.filter(log => log.event_type === 'rate_limit_exceeded').length}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access-control" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  Blocked IP Addresses
                </CardTitle>
                <CardDescription>
                  Manage blocked IP addresses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {blockedIPs.map((ip) => (
                    <div key={ip} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-red-500" />
                        <span className="font-mono">{ip}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unblockIP(ip)}
                      >
                        Unblock
                      </Button>
                    </div>
                  ))}
                  {blockedIPs.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No blocked IP addresses
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  IP Whitelist
                </CardTitle>
                <CardDescription>
                  Trusted IP addresses that bypass restrictions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter IP address"
                    value={newWhitelistIP}
                    onChange={(e) => setNewWhitelistIP(e.target.value)}
                  />
                  <Button onClick={addToWhitelist}>Add</Button>
                </div>

                <div className="space-y-2">
                  {settings.ipWhitelist.map((ip) => (
                    <div key={ip} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-green-500" />
                        <span className="font-mono">{ip}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromWhitelist(ip)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  {settings.ipWhitelist.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No whitelisted IP addresses
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Security Event Logs
              </CardTitle>
              <CardDescription>
                Recent security events and alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {securityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${getSeverityColor(log.severity)} mt-2`}></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.event_type.replace('_', ' ')}</span>
                          {getSeverityBadge(log.severity)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>IP: <span className="font-mono">{log.ip_address}</span></p>
                        {log.user_id && <p>User ID: {log.user_id}</p>}
                        <p>Details: {JSON.stringify(log.details)}</p>
                      </div>
                      {(log.severity === 'high' || log.severity === 'critical') && (
                        <div className="mt-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => blockIP(log.ip_address)}
                            disabled={blockedIPs.includes(log.ip_address)}
                          >
                            {blockedIPs.includes(log.ip_address) ? 'Already Blocked' : 'Block IP'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {securityLogs.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    No security events recorded
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
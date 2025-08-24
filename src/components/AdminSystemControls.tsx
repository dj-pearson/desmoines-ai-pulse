import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSystemMonitoring } from "@/hooks/useSystemMonitoring";
import {
  Settings,
  Server,
  Database,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  HardDrive,
  Cpu,
  MemoryStick,
  Network,
  Bell,
  Mail,
  Smartphone,
  Globe,
  Lock,
  Trash2,
} from "lucide-react";

interface SystemStatus {
  server: 'healthy' | 'warning' | 'critical';
  database: 'healthy' | 'warning' | 'critical';
  storage: 'healthy' | 'warning' | 'critical';
  network: 'healthy' | 'warning' | 'critical';
  uptime: string;
  lastBackup: string;
  activeConnections: number;
  systemLoad: number;
  memoryUsage: number;
  diskUsage: number;
}

interface SystemSettings {
  cachingEnabled: boolean;
  compressionEnabled: boolean;
  cdnEnabled: boolean;
  autoBackup: boolean;
  backupFrequency: string;
  maxFileSize: number;
  sessionTimeout: number;
  debugMode: boolean;
  apiRateLimit: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
  webhookUrl: string;
  maintenanceMessage: string;
}

export default function AdminSystemControls() {
  const { toast } = useToast();
  const {
    systemStatus,
    settings,
    isLoading,
    setSettings,
    loadSystemStatus,
    loadSystemSettings,
    saveSystemSettings,
    clearCache,
    runBackup,
    optimizeDatabase,
    restartService,
  } = useSystemMonitoring();

  useEffect(() => {
    loadSystemStatus();
    loadSystemSettings();
    
    // Set up real-time status updates
    const interval = setInterval(loadSystemStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [loadSystemStatus, loadSystemSettings]);

  const handleSaveSettings = async () => {
    const result = await saveSystemSettings();
    if (result.success) {
      toast({
        title: "Settings Saved",
        description: "System settings have been updated successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to save system settings.",
        variant: "destructive",
      });
    }
  };

  const handleClearCache = async () => {
    const result = await clearCache();
    if (result.success) {
      toast({
        title: "Cache Cleared",
        description: "All cached data has been cleared successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to clear cache.",
        variant: "destructive",
      });
    }
  };

  const handleRunBackup = async () => {
    const result = await runBackup();
    if (result.success) {
      toast({
        title: "Backup Complete",
        description: "System backup has been completed successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to run backup.",
        variant: "destructive",
      });
    }
  };

  const handleOptimizeDatabase = async () => {
    const result = await optimizeDatabase();
    if (result.success) {
      toast({
        title: "Database Optimized",
        description: "Database optimization completed successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to optimize database.",
        variant: "destructive",
      });
    }
  };

  const handleRestartService = async (service: string) => {
    const result = await restartService(service);
    if (result.success) {
      toast({
        title: "Service Restarted",
        description: `${service} has been restarted successfully.`,
      });
    } else {
      toast({
        title: "Error",
        description: `Failed to restart ${service}.`,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant = status === 'healthy' ? 'secondary' : 
                   status === 'warning' ? 'default' : 'destructive';
    return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
  };

  const getUsageColor = (usage: number) => {
    if (usage < 50) return 'bg-green-500';
    if (usage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-purple-500" />
            System Controls
          </h2>
          <p className="text-muted-foreground">
            Monitor and control system performance and settings
          </p>
        </div>
        <Button onClick={handleSaveSettings} disabled={isLoading}>
          <Settings className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>

      {/* System Status Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {getStatusIcon(systemStatus.server)}
              {getStatusBadge(systemStatus.server)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Uptime: {systemStatus.uptime}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {getStatusIcon(systemStatus.database)}
              {getStatusBadge(systemStatus.database)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {systemStatus.activeConnections} connections
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {getStatusIcon(systemStatus.storage)}
              {getStatusBadge(systemStatus.storage)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Last backup: {systemStatus.lastBackup}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4" />
              Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {getStatusIcon(systemStatus.network)}
              {getStatusBadge(systemStatus.network)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              CDN enabled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resource Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Resource Usage
          </CardTitle>
          <CardDescription>Real-time system resource monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">CPU Load</span>
                <span className="text-sm text-muted-foreground">{systemStatus.systemLoad}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getUsageColor(systemStatus.systemLoad)}`}
                  style={{ width: `${systemStatus.systemLoad}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Memory Usage</span>
                <span className="text-sm text-muted-foreground">{systemStatus.memoryUsage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getUsageColor(systemStatus.memoryUsage)}`}
                  style={{ width: `${systemStatus.memoryUsage}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Disk Usage</span>
                <span className="text-sm text-muted-foreground">{systemStatus.diskUsage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getUsageColor(systemStatus.diskUsage)}`}
                  style={{ width: `${systemStatus.diskUsage}%` }}
                ></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="backup">Backup & Storage</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Performance Settings
                </CardTitle>
                <CardDescription>
                  Configure performance optimization features
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="caching">Enable Caching</Label>
                    <p className="text-sm text-muted-foreground">
                      Cache static content for faster loading
                    </p>
                  </div>
                  <Switch
                    id="caching"
                    checked={settings.cachingEnabled}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, cachingEnabled: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="compression">Enable Compression</Label>
                    <p className="text-sm text-muted-foreground">
                      Compress responses to reduce bandwidth
                    </p>
                  </div>
                  <Switch
                    id="compression"
                    checked={settings.compressionEnabled}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, compressionEnabled: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="cdn">CDN Integration</Label>
                    <p className="text-sm text-muted-foreground">
                      Use CDN for global content delivery
                    </p>
                  </div>
                  <Switch
                    id="cdn"
                    checked={settings.cdnEnabled}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, cdnEnabled: checked }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="apiLimit">API Rate Limit (requests/minute)</Label>
                  <Input
                    id="apiLimit"
                    type="number"
                    value={settings.apiRateLimit}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, apiRateLimit: parseInt(e.target.value) || 1000 }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) || 30 }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Common system maintenance tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={handleClearCache}
                  disabled={isLoading}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Cache
                </Button>

                <Button
                  onClick={() => handleRestartService('Web Server')}
                  disabled={isLoading}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Web Server
                </Button>

                <Button
                  onClick={handleOptimizeDatabase}
                  disabled={isLoading}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Optimize Database
                </Button>

                <Button
                  onClick={() => handleRestartService('CDN')}
                  disabled={isLoading}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Refresh CDN Cache
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Backup Settings
                </CardTitle>
                <CardDescription>
                  Configure automated backup schedule
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoBackup">Automatic Backups</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable scheduled backups
                    </p>
                  </div>
                  <Switch
                    id="autoBackup"
                    checked={settings.autoBackup}
                    onCheckedChange={(checked) =>
                      setSettings(prev => ({ ...prev, autoBackup: checked }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="backupFreq">Backup Frequency</Label>
                  <Select
                    value={settings.backupFrequency}
                    onValueChange={(value) =>
                      setSettings(prev => ({ ...prev, backupFrequency: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
                  <Input
                    id="maxFileSize"
                    type="number"
                    value={settings.maxFileSize}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, maxFileSize: parseInt(e.target.value) || 10 }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manual Backup</CardTitle>
                <CardDescription>
                  Run backup operations manually
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p>Last backup: {systemStatus.lastBackup}</p>
                  <p>Backup size: 2.4 GB</p>
                  <p>Storage used: 15.2 GB / 100 GB</p>
                </div>

                <Button
                  onClick={handleRunBackup}
                  disabled={isLoading}
                  className="w-full"
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  {isLoading ? 'Running Backup...' : 'Run Backup Now'}
                </Button>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Recent Backups:</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>✓ 2024-01-08 06:00 - Full backup (2.4 GB)</p>
                    <p>✓ 2024-01-07 06:00 - Full backup (2.3 GB)</p>
                    <p>✓ 2024-01-06 06:00 - Full backup (2.2 GB)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure system alert notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <div>
                        <Label htmlFor="emailNotifs">Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive alerts via email
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="emailNotifs"
                      checked={settings.emailNotifications}
                      onCheckedChange={(checked) =>
                        setSettings(prev => ({ ...prev, emailNotifications: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      <div>
                        <Label htmlFor="smsNotifs">SMS Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive alerts via SMS
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="smsNotifs"
                      checked={settings.smsNotifications}
                      onCheckedChange={(checked) =>
                        setSettings(prev => ({ ...prev, smsNotifications: checked }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Send alerts to external services
                  </p>
                  <Input
                    id="webhookUrl"
                    placeholder="https://your-service.com/webhook"
                    value={settings.webhookUrl}
                    onChange={(e) =>
                      setSettings(prev => ({ ...prev, webhookUrl: e.target.value }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Maintenance Mode
              </CardTitle>
              <CardDescription>
                Configure maintenance mode settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="debugMode">Debug Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable detailed error logging
                  </p>
                </div>
                <Switch
                  id="debugMode"
                  checked={settings.debugMode}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, debugMode: checked }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="maintenanceMsg">Maintenance Message</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Message shown to users during maintenance
                </p>
                <Textarea
                  id="maintenanceMsg"
                  value={settings.maintenanceMessage}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, maintenanceMessage: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
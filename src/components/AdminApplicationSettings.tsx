import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Settings, 
  Bell, 
  Shield, 
  Zap, 
  Mail, 
  Eye, 
  Globe,
  Clock,
  Database,
  BarChart,
  Server,
  Palette,
  RefreshCw
} from 'lucide-react';

interface ApplicationSettings {
  // Site-wide settings
  siteName: string;
  siteDescription: string;
  siteUrl: string;
  defaultTimeZone: string;
  maintenanceMode: boolean;
  
  // Email settings
  emailProvider: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  
  // Notification settings
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  newsletterEnabled: boolean;
  
  // Content moderation
  autoModerationEnabled: boolean;
  requireApproval: boolean;
  spamDetection: boolean;
  profanityFilter: boolean;
  
  // API settings
  rateLimitPerMinute: number;
  apiDocsEnabled: boolean;
  webhooksEnabled: boolean;
  corsEnabled: boolean;
  
  // Analytics
  googleAnalyticsId: string;
  facebookPixelId: string;
  trackingEnabled: boolean;
  heatmapEnabled: boolean;
  
  // Performance
  cachingEnabled: boolean;
  compressionEnabled: boolean;
  cdnEnabled: boolean;
  imageOptimization: boolean;
  
  // Security
  twoFactorRequired: boolean;
  sessionTimeout: number;
  passwordComplexity: boolean;
  loginAttempts: number;
}

export default function AdminApplicationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ApplicationSettings>({
    // Site-wide settings
    siteName: 'Des Moines Pulse',
    siteDescription: 'Your guide to events, restaurants, and happenings in Des Moines',
    siteUrl: 'https://desmoinespulse.com',
    defaultTimeZone: 'America/Chicago',
    maintenanceMode: false,
    
    // Email settings
    emailProvider: 'smtp',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: 'noreply@desmoinespulse.com',
    fromName: 'Des Moines Pulse',
    
    // Notification settings
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    newsletterEnabled: true,
    
    // Content moderation
    autoModerationEnabled: true,
    requireApproval: false,
    spamDetection: true,
    profanityFilter: true,
    
    // API settings
    rateLimitPerMinute: 1000,
    apiDocsEnabled: true,
    webhooksEnabled: true,
    corsEnabled: true,
    
    // Analytics
    googleAnalyticsId: '',
    facebookPixelId: '',
    trackingEnabled: true,
    heatmapEnabled: false,
    
    // Performance
    cachingEnabled: true,
    compressionEnabled: true,
    cdnEnabled: true,
    imageOptimization: true,
    
    // Security
    twoFactorRequired: false,
    sessionTimeout: 30,
    passwordComplexity: true,
    loginAttempts: 5,
  });

  const handleSave = async (section?: string) => {
    setLoading(true);
    try {
      // Save settings to localStorage for now (in production, this would save to database)
      localStorage.setItem('adminApplicationSettings', JSON.stringify(settings));
      
      toast({
        title: "Settings Saved",
        description: section ? `${section} settings have been updated successfully.` : "All settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = (section: string) => {
    // Reset specific section to defaults
    toast({
      title: "Settings Reset",
      description: `${section} settings have been reset to defaults.`,
    });
  };

  useEffect(() => {
    // Load settings from localStorage on mount
    const savedSettings = localStorage.getItem('adminApplicationSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to load saved settings:', error);
      }
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Application Settings</h1>
          <p className="text-muted-foreground">Configure system settings and preferences</p>
        </div>
        <Button onClick={() => handleSave()} disabled={loading} className="min-w-24">
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Settings className="h-4 w-4 mr-2" />
              Save All
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:grid-cols-8">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="moderation" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Moderation</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Site-wide Settings
              </CardTitle>
              <CardDescription>
                Configure basic information about your application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => setSettings(prev => ({ ...prev, siteName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteUrl">Site URL</Label>
                  <Input
                    id="siteUrl"
                    value={settings.siteUrl}
                    onChange={(e) => setSettings(prev => ({ ...prev, siteUrl: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="siteDescription">Site Description</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.siteDescription}
                  onChange={(e) => setSettings(prev => ({ ...prev, siteDescription: e.target.value }))}
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timeZone">Default Time Zone</Label>
                  <Select value={settings.defaultTimeZone} onValueChange={(value) => setSettings(prev => ({ ...prev, defaultTimeZone: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Chicago">Central Time (Chicago)</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time (New York)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (Denver)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (Los Angeles)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="maintenanceMode"
                    checked={settings.maintenanceMode}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, maintenanceMode: checked }))}
                  />
                  <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                  {settings.maintenanceMode && <Badge variant="destructive">Active</Badge>}
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('General')} disabled={loading}>
                  Save General Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
              <CardDescription>
                Configure SMTP settings and email templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fromEmail">From Email</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={settings.fromEmail}
                    onChange={(e) => setSettings(prev => ({ ...prev, fromEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    value={settings.fromName}
                    onChange={(e) => setSettings(prev => ({ ...prev, fromName: e.target.value }))}
                  />
                </div>
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">SMTP Host</Label>
                  <Input
                    id="smtpHost"
                    value={settings.smtpHost}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">SMTP Port</Label>
                  <Input
                    id="smtpPort"
                    value={settings.smtpPort}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtpPort: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailProvider">Provider</Label>
                  <Select value={settings.emailProvider} onValueChange={(value) => setSettings(prev => ({ ...prev, emailProvider: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smtp">SMTP</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                      <SelectItem value="ses">Amazon SES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpUsername">SMTP Username</Label>
                  <Input
                    id="smtpUsername"
                    value={settings.smtpUsername}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtpUsername: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPassword">SMTP Password</Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    value={settings.smtpPassword}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtpPassword: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Email')} disabled={loading}>
                  Save Email Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure how users receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send notifications via email
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, emailNotifications: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send browser push notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.pushNotifications}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, pushNotifications: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send notifications via SMS
                    </p>
                  </div>
                  <Switch
                    checked={settings.smsNotifications}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, smsNotifications: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Newsletter</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable newsletter subscriptions
                    </p>
                  </div>
                  <Switch
                    checked={settings.newsletterEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, newsletterEnabled: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Notifications')} disabled={loading}>
                  Save Notification Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moderation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Content Moderation
              </CardTitle>
              <CardDescription>
                Configure automatic content moderation and approval workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto Moderation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically moderate content using AI
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoModerationEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoModerationEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Approval</Label>
                    <p className="text-sm text-muted-foreground">
                      All content requires manual approval before publishing
                    </p>
                  </div>
                  <Switch
                    checked={settings.requireApproval}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, requireApproval: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Spam Detection</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically detect and filter spam content
                    </p>
                  </div>
                  <Switch
                    checked={settings.spamDetection}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, spamDetection: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Profanity Filter</Label>
                    <p className="text-sm text-muted-foreground">
                      Filter out inappropriate language
                    </p>
                  </div>
                  <Switch
                    checked={settings.profanityFilter}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, profanityFilter: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Content Moderation')} disabled={loading}>
                  Save Moderation Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                API Rate Limiting & Configuration
              </CardTitle>
              <CardDescription>
                Configure API access, rate limiting, and documentation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rateLimitPerMinute">Rate Limit (per minute)</Label>
                  <Input
                    id="rateLimitPerMinute"
                    type="number"
                    value={settings.rateLimitPerMinute}
                    onChange={(e) => setSettings(prev => ({ ...prev, rateLimitPerMinute: parseInt(e.target.value) || 1000 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loginAttempts">Max Login Attempts</Label>
                  <Input
                    id="loginAttempts"
                    type="number"
                    value={settings.loginAttempts}
                    onChange={(e) => setSettings(prev => ({ ...prev, loginAttempts: parseInt(e.target.value) || 5 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>API Documentation</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable public API documentation
                    </p>
                  </div>
                  <Switch
                    checked={settings.apiDocsEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, apiDocsEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Webhooks</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable webhook functionality
                    </p>
                  </div>
                  <Switch
                    checked={settings.webhooksEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, webhooksEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>CORS Support</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable Cross-Origin Resource Sharing
                    </p>
                  </div>
                  <Switch
                    checked={settings.corsEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, corsEnabled: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('API')} disabled={loading}>
                  Save API Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5" />
                Analytics & Tracking
              </CardTitle>
              <CardDescription>
                Configure analytics providers and tracking preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="googleAnalyticsId">Google Analytics ID</Label>
                  <Input
                    id="googleAnalyticsId"
                    placeholder="G-XXXXXXXXXX"
                    value={settings.googleAnalyticsId}
                    onChange={(e) => setSettings(prev => ({ ...prev, googleAnalyticsId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facebookPixelId">Facebook Pixel ID</Label>
                  <Input
                    id="facebookPixelId"
                    placeholder="123456789012345"
                    value={settings.facebookPixelId}
                    onChange={(e) => setSettings(prev => ({ ...prev, facebookPixelId: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>User Tracking</Label>
                    <p className="text-sm text-muted-foreground">
                      Track user behavior and analytics
                    </p>
                  </div>
                  <Switch
                    checked={settings.trackingEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, trackingEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Heatmap Tracking</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable heatmap and user session recording
                    </p>
                  </div>
                  <Switch
                    checked={settings.heatmapEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, heatmapEnabled: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Analytics')} disabled={loading}>
                  Save Analytics Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Performance Optimization
              </CardTitle>
              <CardDescription>
                Configure caching, compression, and performance features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Caching</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable server-side caching for better performance
                    </p>
                  </div>
                  <Switch
                    checked={settings.cachingEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, cachingEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Compression</Label>
                    <p className="text-sm text-muted-foreground">
                      Compress responses to reduce bandwidth usage
                    </p>
                  </div>
                  <Switch
                    checked={settings.compressionEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, compressionEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>CDN</Label>
                    <p className="text-sm text-muted-foreground">
                      Use Content Delivery Network for static assets
                    </p>
                  </div>
                  <Switch
                    checked={settings.cdnEnabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, cdnEnabled: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Image Optimization</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically optimize images for web delivery
                    </p>
                  </div>
                  <Switch
                    checked={settings.imageOptimization}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, imageOptimization: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Performance')} disabled={loading}>
                  Save Performance Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure authentication and security policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) || 30 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loginAttempts">Max Login Attempts</Label>
                  <Input
                    id="loginAttempts"
                    type="number"
                    value={settings.loginAttempts}
                    onChange={(e) => setSettings(prev => ({ ...prev, loginAttempts: parseInt(e.target.value) || 5 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Require 2FA for all admin accounts
                    </p>
                  </div>
                  <Switch
                    checked={settings.twoFactorRequired}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, twoFactorRequired: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Password Complexity</Label>
                    <p className="text-sm text-muted-foreground">
                      Enforce strong password requirements
                    </p>
                  </div>
                  <Switch
                    checked={settings.passwordComplexity}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, passwordComplexity: checked }))}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button onClick={() => handleSave('Security')} disabled={loading}>
                  Save Security Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import { useState } from "react";
import {
  Key,
  Plus,
  Copy,
  Trash2,
  MoreVertical,
  Check,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useApiKeys, API_PERMISSIONS, API_SCOPES } from "@/hooks/useApiKeys";
import { cn } from "@/lib/utils";

interface ApiKeyManagerProps {
  className?: string;
}

export function ApiKeyManager({ className }: ApiKeyManagerProps) {
  const {
    apiKeys,
    activeKeys,
    isLoadingKeys,
    createKey,
    revokeKey,
    isCreating,
    isRevoking,
    getKeyStats,
    copyToClipboard,
    refetchKeys,
  } = useApiKeys();

  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: ["read"] as string[],
    scopes: [] as string[],
    expiresInDays: undefined as number | undefined,
  });

  const handleCreateKey = async () => {
    try {
      const result = await createKey({
        name: formData.name,
        description: formData.description || undefined,
        permissions: formData.permissions,
        scopes: formData.scopes,
        expiresInDays: formData.expiresInDays,
      });

      if (result.success) {
        setNewApiKey(result.api_key);
        setIsCreateOpen(false);
        toast({
          title: "API Key Created",
          description: "Your new API key has been created. Make sure to copy it now!",
        });
        // Reset form
        setFormData({
          name: "",
          description: "",
          permissions: ["read"],
          scopes: [],
          expiresInDays: undefined,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    }
  };

  const handleRevokeKey = async () => {
    if (!selectedKeyId) return;

    try {
      await revokeKey(selectedKeyId);
      setIsRevokeDialogOpen(false);
      setSelectedKeyId(null);
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked and can no longer be used.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    }
  };

  const handleCopyKey = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      toast({
        title: "Copied!",
        description: "API key copied to clipboard",
      });
    }
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const toggleScope = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  if (isLoadingKeys) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Loading your API keys...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Manage your personal access tokens for API access
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchKeys()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Key
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for programmatic access to the API.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Key Name *</Label>
                    <Input
                      id="name"
                      placeholder="My API Key"
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="What is this key for?"
                      value={formData.description}
                      onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Permissions</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(API_PERMISSIONS).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50"
                        >
                          <Checkbox
                            checked={formData.permissions.includes(key)}
                            onCheckedChange={() => togglePermission(key)}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                      {Object.entries(API_SCOPES).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50"
                        >
                          <Checkbox
                            checked={formData.scopes.includes(key)}
                            onCheckedChange={() => toggleScope(key)}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expires">Expires In (days)</Label>
                    <Input
                      id="expires"
                      type="number"
                      placeholder="Never expires"
                      value={formData.expiresInDays || ""}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        expiresInDays: e.target.value ? parseInt(e.target.value) : undefined,
                      }))}
                    />
                    <p className="text-xs text-gray-500">
                      Leave empty for no expiration
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateKey}
                    disabled={!formData.name || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Key className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No API keys created yet</p>
              <p className="text-sm">Create your first API key to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map(key => {
                const stats = getKeyStats(key);
                return (
                  <div
                    key={key.id}
                    className={cn(
                      "flex items-center justify-between p-4 border rounded-lg",
                      !stats.isActive && "opacity-60 bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded">
                        <Key className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{key.name}</span>
                          {!stats.isActive && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {stats.isExpired && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                          {stats.isNearExpiry && !stats.isExpired && (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Expires soon
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                            {key.key_prefix}...
                          </code>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {stats.lastUsedDate
                              ? `Last used ${stats.lastUsedDate.toLocaleDateString()}`
                              : "Never used"}
                          </span>
                          <span>{stats.usageCount} requests</span>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            setSelectedKeyId(key.id);
                            setIsRevokeDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke Key
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New API Key Display Dialog */}
      <Dialog open={!!newApiKey} onOpenChange={() => setNewApiKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-gray-50 p-4 rounded-lg border">
              <Label className="text-xs text-gray-500">Your API Key</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 font-mono text-sm break-all">
                  {showNewKey ? newApiKey : "••••••••••••••••••••••••••••••••"}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewKey(!showNewKey)}
                >
                  {showNewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => newApiKey && handleCopyKey(newApiKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 inline-block mr-2" />
              Store this key securely. It will not be shown again.
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setNewApiKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The API key will be immediately revoked
              and any applications using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeKey}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRevoking ? "Revoking..." : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

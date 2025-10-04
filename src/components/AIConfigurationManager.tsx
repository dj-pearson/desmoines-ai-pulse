import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import { useAIModels } from "@/hooks/useAIModels";
import { Loader2, Save, Bot, Settings, Zap, Cpu, TestTube, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AIConfigurationManager() {
  const { settings, isLoading, updateSetting, isUpdating, getSetting } = useAIConfiguration();
  const { models, isLoading: modelsLoading, addModel, deleteModel, isAdding, isDeleting } = useAIModels();
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response?: string } | null>(null);
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [newModel, setNewModel] = useState({
    model_id: '',
    model_name: '',
    provider: 'Anthropic',
    description: '',
    context_window: 200000,
    max_output_tokens: 8192,
    supports_vision: true,
  });

  if (isLoading || modelsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentModel = getSetting('default_model', '');
  
  const handleAddModel = () => {
    addModel(newModel);
    setIsAddModelOpen(false);
    setNewModel({
      model_id: '',
      model_name: '',
      provider: 'Anthropic',
      description: '',
      context_window: 200000,
      max_output_tokens: 8192,
      supports_vision: true,
    });
  };
  
  const handleSave = (key: string) => {
    const value = editedValues[key];
    if (value !== undefined) {
      updateSetting({ key, value });
      setEditedValues((prev) => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
  };

  const getDisplayValue = (key: string, value: any) => {
    const editedValue = editedValues[key];
    if (editedValue !== undefined) return editedValue;
    
    if (typeof value === "string") return value;
    if (typeof value === "number") return value.toString();
    return JSON.stringify(value);
  };

  const hasChanges = (key: string) => editedValues[key] !== undefined;

  const testAIModel = async (modelId?: string) => {
    const modelToTest = modelId || currentModel;
    setIsTesting(true);
    setTestResult(null);

    try {
      toast.info('Testing AI model...', {
        description: `Testing ${modelToTest}`
      });

      const { data, error } = await supabase.functions.invoke('test-ai-model', {
        body: {
          model: modelToTest,
          testPrompt: 'Generate a brief, engaging one-sentence description of a jazz music event in Des Moines.'
        }
      });

      if (error) throw error;

      if (data.success) {
        setTestResult({
          success: true,
          message: 'Model test successful',
          response: data.generatedText
        });
        toast.success('AI model test successful', {
          description: `${modelToTest} is working correctly`
        });
      } else {
        throw new Error(data.error || data.message || 'Test failed');
      }
    } catch (error: any) {
      console.error('Error testing AI model:', error);
      setTestResult({
        success: false,
        message: error.message || 'Test failed'
      });
      toast.error('AI model test failed', {
        description: error.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>AI Configuration Hub</CardTitle>
              <CardDescription>
                Centralized AI settings for all modules including scraper, crawler, social media, and article generation
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">Active Modules</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
              <div>• Firecrawl Scraper</div>
              <div>• AI Crawler</div>
              <div>• Social Media Manager</div>
              <div>• Article Generator</div>
              <div>• SEO Content Generator</div>
              <div>• Event Enhancer</div>
              <div>• Writeup Generator</div>
              <div>• Weekend Guide</div>
            </div>
          </div>

          <Separator />

          {/* Model Bank Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    AI Model Bank
                  </CardTitle>
                  <CardDescription>
                    Manage available AI models and test them
                  </CardDescription>
                </div>
                <Dialog open={isAddModelOpen} onOpenChange={setIsAddModelOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Model
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New AI Model</DialogTitle>
                      <DialogDescription>
                        Add a new model to your available models bank
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="model_id">Model ID</Label>
                        <Input
                          id="model_id"
                          placeholder="claude-sonnet-4-5-20250929"
                          value={newModel.model_id}
                          onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="model_name">Display Name</Label>
                        <Input
                          id="model_name"
                          placeholder="Claude Sonnet 4.5"
                          value={newModel.model_name}
                          onChange={(e) => setNewModel({ ...newModel, model_name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Select value={newModel.provider} onValueChange={(value) => setNewModel({ ...newModel, provider: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Anthropic">Anthropic</SelectItem>
                            <SelectItem value="Google">Google</SelectItem>
                            <SelectItem value="OpenAI">OpenAI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          placeholder="Model description"
                          value={newModel.description}
                          onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="supports_vision">Supports Vision</Label>
                        <Switch
                          id="supports_vision"
                          checked={newModel.supports_vision}
                          onCheckedChange={(checked) => setNewModel({ ...newModel, supports_vision: checked })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddModel} disabled={isAdding || !newModel.model_id || !newModel.model_name}>
                        {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Add Model
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Max Output</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models?.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{model.model_name}</div>
                          <div className="text-xs text-muted-foreground">{model.model_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{model.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{model.context_window?.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{model.max_output_tokens?.toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testAIModel(model.model_id)}
                          disabled={isTesting}
                        >
                          <TestTube className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteModel(model.id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {testResult && (
                <Alert variant={testResult.success ? "default" : "destructive"}>
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-2">
                      <AlertDescription>
                        <strong>{testResult.message}</strong>
                      </AlertDescription>
                      {testResult.response && (
                        <div className="text-sm bg-muted/50 p-3 rounded-md">
                          <p className="font-medium mb-1">Generated Response:</p>
                          <p className="text-muted-foreground">{testResult.response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Compact Table Layout for Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">AI Configuration Settings</h3>
              <Badge variant="outline">{settings?.length || 0} Settings</Badge>
            </div>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Setting</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings?.map((setting) => (
                    <TableRow key={setting.id}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {setting.setting_key.includes("model") && <Bot className="h-4 w-4 text-muted-foreground" />}
                            {setting.setting_key.includes("temperature") && <Zap className="h-4 w-4 text-muted-foreground" />}
                            {setting.setting_key.includes("tokens") && <Cpu className="h-4 w-4 text-muted-foreground" />}
                            {!setting.setting_key.includes("model") && !setting.setting_key.includes("temperature") && !setting.setting_key.includes("tokens") && <Settings className="h-4 w-4 text-muted-foreground" />}
                            <span className="text-sm">
                              {setting.setting_key.split("_").map(word => 
                                word.charAt(0).toUpperCase() + word.slice(1)
                              ).join(" ")}
                            </span>
                          </div>
                          {setting.description && (
                            <p className="text-xs text-muted-foreground">{setting.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {setting.setting_key === 'default_model' ? (
                          <Select
                            value={getDisplayValue(setting.setting_key, setting.setting_value)}
                            onValueChange={(value) =>
                              setEditedValues((prev) => ({
                                ...prev,
                                [setting.setting_key]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {models?.map((model) => (
                                <SelectItem key={model.id} value={model.model_id}>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">{model.provider}</Badge>
                                    {model.model_name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={getDisplayValue(setting.setting_key, setting.setting_value)}
                            onChange={(e) =>
                              setEditedValues((prev) => ({
                                ...prev,
                                [setting.setting_key]: e.target.value,
                              }))
                            }
                            placeholder={`Enter ${setting.setting_key}`}
                            className="w-full"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={hasChanges(setting.setting_key) ? "default" : "outline"} className="text-xs">
                          {hasChanges(setting.setting_key) ? "Modified" : "Saved"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {setting.setting_key === 'default_model' && (
                          <Button
                            onClick={() =>
                              testAIModel(
                                editedValues['default_model'] ?? getDisplayValue(setting.setting_key, setting.setting_value)
                              )
                            }
                            disabled={isTesting}
                            size="sm"
                            variant="outline"
                            className="mr-2"
                          >
                            <TestTube className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => handleSave(setting.setting_key)}
                          disabled={!hasChanges(setting.setting_key) || isUpdating}
                          size="sm"
                          variant={hasChanges(setting.setting_key) ? "default" : "ghost"}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Last updated: {settings?.[0] ? new Date(settings[0].updated_at).toLocaleString() : 'N/A'}
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex gap-2">
              <Bot className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  Model Configuration Guide
                </p>
                <p className="text-amber-800 dark:text-amber-200">
                  Manage your AI model bank above. Add new models as they're released, test them individually, then select your default model in the settings below. All modules will use the configured default model. Current default: <strong>{currentModel}</strong>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

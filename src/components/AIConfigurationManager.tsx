import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import { Loader2, Save, Bot, Settings, Zap, Cpu, TestTube, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const AI_MODELS = [
  // Google Gemini Models
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Default)', category: 'Google' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', category: 'Google' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', category: 'Google' },
  { value: 'google/gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image Preview', category: 'Google' },
  
  // OpenAI GPT Models
  { value: 'openai/gpt-5', label: 'GPT-5', category: 'OpenAI' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', category: 'OpenAI' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', category: 'OpenAI' },
  
  // Anthropic Claude Models
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', category: 'Anthropic' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', category: 'Anthropic' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', category: 'Anthropic' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', category: 'Anthropic' },
];

export function AIConfigurationManager() {
  const { settings, isLoading, updateSetting, isUpdating, getSetting } = useAIConfiguration();
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response?: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentModel = getSetting('default_model', 'google/gemini-2.5-flash');
  
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

  const testAIModel = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      toast.info('Testing current AI model...', {
        description: `Testing ${currentModel}`
      });

      const { data, error } = await supabase.functions.invoke('test-ai-model', {
        body: {
          model: currentModel,
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
          description: `${currentModel} is working correctly`
        });
      } else {
        throw new Error(data.message || 'Test failed');
      }
    } catch (error) {
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

          {/* AI Model Testing Section */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Test Current AI Model
              </CardTitle>
              <CardDescription>
                Test the currently configured default model to verify it's working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium mb-1">Current Model:</div>
                  <code className="px-3 py-2 rounded bg-muted text-sm block">{currentModel}</code>
                </div>
                
                <Button 
                  onClick={testAIModel} 
                  disabled={isTesting}
                  size="default"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="h-4 w-4 mr-2" />
                      Test Model
                    </>
                  )}
                </Button>
              </div>

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

              <div className="text-xs text-muted-foreground">
                <p>This test sends a sample prompt to verify the model is responding correctly. Change the default model in the table below to test different models.</p>
              </div>
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
                              {AI_MODELS.map((model) => (
                                <SelectItem key={model.value} value={model.value}>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">{model.category}</Badge>
                                    {model.label}
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
                  Select your preferred AI model from the dropdown above. All modules (Firecrawl Scraper, AI Crawler, Social Media Manager, etc.) will automatically use the configured model. After changing the model, use the "Test Model" button to verify it's working correctly.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

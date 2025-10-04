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

export function AIConfigurationManager() {
  const { settings, isLoading, updateSetting, isUpdating, getSetting } = useAIConfiguration();
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [selectedModel, setSelectedModel] = useState<string>('google/gemini-2.5-flash');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response?: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

  const getCategoryIcon = (key: string) => {
    if (key.includes("model")) return <Bot className="h-4 w-4" />;
    if (key.includes("temperature")) return <Zap className="h-4 w-4" />;
    if (key.includes("tokens")) return <Cpu className="h-4 w-4" />;
    return <Settings className="h-4 w-4" />;
  };

  const testAIModel = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      toast.info('Testing AI model...', {
        description: `Testing ${selectedModel}`
      });

      const { data, error } = await supabase.functions.invoke('test-ai-model', {
        body: {
          model: selectedModel,
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
          description: `${selectedModel} is working correctly`
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
                Test AI Model
              </CardTitle>
              <CardDescription>
                Test different AI models to verify they're working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (Default)</SelectItem>
                    <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                    <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
                    <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="openai/gpt-5-nano">GPT-5 Nano</SelectItem>
                  </SelectContent>
                </Select>
                
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
                <p>This test sends a sample prompt to verify the selected model is responding correctly.</p>
                <p className="mt-1">Current configured model: <code className="px-1 py-0.5 rounded bg-muted">{getSetting('default_model', 'google/gemini-2.5-flash')}</code></p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="space-y-4">
            {settings?.map((setting) => (
              <Card key={setting.id} className="border-muted">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        {getCategoryIcon(setting.setting_key)}
                        <div className="flex-1">
                          <Label htmlFor={setting.setting_key} className="text-base font-medium">
                            {setting.setting_key.split("_").map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(" ")}
                          </Label>
                          {setting.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {setting.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant={hasChanges(setting.setting_key) ? "default" : "outline"} className="shrink-0">
                        {hasChanges(setting.setting_key) ? "Modified" : "Saved"}
                      </Badge>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        id={setting.setting_key}
                        value={getDisplayValue(setting.setting_key, setting.setting_value)}
                        onChange={(e) =>
                          setEditedValues((prev) => ({
                            ...prev,
                            [setting.setting_key]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${setting.setting_key}`}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => handleSave(setting.setting_key)}
                        disabled={!hasChanges(setting.setting_key) || isUpdating}
                        size="default"
                      >
                        {isUpdating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Last updated: {new Date(setting.updated_at).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex gap-2">
              <Bot className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  Model Update Guide
                </p>
                <p className="text-amber-800 dark:text-amber-200">
                  When updating models (e.g., to <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900">claude-sonnet-4-5-20250929</code>), 
                  change the <strong>Default Model</strong> setting above. All modules will automatically use the new model on their next execution.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

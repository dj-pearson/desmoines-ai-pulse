import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import { Loader2, Save, Bot, Settings, Zap, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function AIConfigurationManager() {
  const { settings, isLoading, updateSetting, isUpdating } = useAIConfiguration();
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});

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

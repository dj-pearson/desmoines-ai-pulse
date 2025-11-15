import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, FileText, Plus, Lightbulb, X } from 'lucide-react';
import {
  getTemplatesByCategory,
  type ContentTemplate,
} from '@/lib/contentTemplates';

interface ContentTemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: 'event' | 'article';
  onSelectTemplate: (template: ContentTemplate | null) => void;
}

export default function ContentTemplateSelector({
  open,
  onOpenChange,
  contentType,
  onSelectTemplate,
}: ContentTemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const templates = getTemplatesByCategory(contentType);

  const handleSelectTemplate = (template: ContentTemplate) => {
    setSelectedTemplate(template);
  };

  const handleContinue = () => {
    onSelectTemplate(selectedTemplate);
    onOpenChange(false);
  };

  const handleStartFromScratch = () => {
    onSelectTemplate(null);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Choose a Template
          </DialogTitle>
          <DialogDescription>
            Start with a pre-configured template or create from scratch. Templates include helpful
            defaults and tips to speed up content creation.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="templates" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="blank">
              <Plus className="h-4 w-4 mr-2" />
              Start from Scratch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[450px] pr-4">
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template) => {
                  const isSelected = selectedTemplate?.id === template.id;
                  return (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        isSelected ? 'ring-2 ring-primary shadow-md' : ''
                      }`}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <span className="text-2xl">{template.icon}</span>
                          <span>{template.name}</span>
                          {isSelected && (
                            <Badge variant="default" className="ml-auto">
                              Selected
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {template.description}
                        </CardDescription>
                      </CardHeader>

                      {isSelected && template.tips && template.tips.length > 0 && (
                        <CardContent className="pt-0">
                          <div className="bg-primary/5 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                              <Lightbulb className="h-4 w-4" />
                              Tips for this template:
                            </div>
                            <ul className="space-y-1 text-xs text-muted-foreground">
                              {template.tips.slice(0, 3).map((tip, index) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-primary mt-0.5">•</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                              {template.tips.length > 3 && (
                                <li className="text-xs italic">
                                  +{template.tips.length - 3} more tips...
                                </li>
                              )}
                            </ul>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4 flex-shrink-0">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleContinue} disabled={!selectedTemplate}>
                Continue with Template
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="blank" className="flex-1 min-h-0 mt-4">
            <div className="h-[450px] flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="flex justify-center">
                  <div className="rounded-full bg-muted p-6">
                    <Plus className="h-12 w-12 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Start from Scratch</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a {contentType} without using a template. You'll have a blank form with
                    all available fields.
                  </p>
                </div>

                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Tip:</strong> Templates can save time by pre-filling common fields and
                    providing helpful guidance. Consider using a template if this is your first
                    time creating this type of content.
                  </AlertDescription>
                </Alert>

                <Button onClick={handleStartFromScratch} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Blank {contentType === 'event' ? 'Event' : 'Article'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

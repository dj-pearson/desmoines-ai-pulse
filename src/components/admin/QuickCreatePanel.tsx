import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Zap, TrendingUp } from 'lucide-react';
import { getTemplateById } from '@/lib/contentTemplates';

interface QuickCreatePanelProps {
  onCreateFromTemplate: (templateId: string, contentType: 'event' | 'article') => void;
}

const QUICK_CREATE_TEMPLATES = [
  // Most common event types
  { templateId: 'concert-live-music', contentType: 'event' as const, featured: true },
  { templateId: 'festival', contentType: 'event' as const, featured: true },
  { templateId: 'food-dining', contentType: 'event' as const, featured: false },
  { templateId: 'kids-family', contentType: 'event' as const, featured: false },
  { templateId: 'sports-game', contentType: 'event' as const, featured: false },
  { templateId: 'nightlife', contentType: 'event' as const, featured: false },
];

export default function QuickCreatePanel({ onCreateFromTemplate }: QuickCreatePanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Quick Create
        </CardTitle>
        <CardDescription>
          Start creating popular content types with one click
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {QUICK_CREATE_TEMPLATES.map(({ templateId, contentType, featured }) => {
            const template = getTemplateById(templateId);
            if (!template) return null;

            return (
              <Button
                key={templateId}
                variant="outline"
                className="h-auto py-4 px-4 flex flex-col items-start gap-2 hover:bg-primary/5 hover:border-primary transition-all"
                onClick={() => onCreateFromTemplate(templateId, contentType)}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-2xl">{template.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {template.name}
                      {featured && (
                        <Badge variant="secondary" className="text-xs py-0 px-1.5">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Popular
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {template.description}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Button>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            💡 Templates include pre-filled defaults and helpful tips to speed up content creation
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useArticles } from '@/hooks/useArticles';
import { useAuth } from '@/hooks/useAuth';
import { FileText, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GenerateArticleButtonProps {
  suggestionId: string;
  suggestionTitle: string;
  suggestionDescription?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

const GenerateArticleButton: React.FC<GenerateArticleButtonProps> = ({
  suggestionId,
  suggestionTitle,
  suggestionDescription,
  variant = 'default',
  size = 'sm',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { generateArticleFromSuggestion } = useArticles();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleGenerateArticle = async () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to generate articles.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);
      
      const article = await generateArticleFromSuggestion(
        suggestionId, 
        customPrompt || undefined
      );

      if (article) {
        setIsOpen(false);
        setCustomPrompt('');
        toast({
          title: 'Article generated successfully!',
          description: `"${article.title}" has been created as a draft. You can edit and publish it from the Admin panel.`,
        });
      }
    } catch (error) {
      console.error('Error generating article:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={`flex items-center gap-2 ${className}`}
          disabled={!user}
        >
          <FileText className="h-4 w-4" />
          Generate Article
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Article from AI Suggestion
          </DialogTitle>
          <DialogDescription>
            Create a comprehensive article based on this AI content suggestion. 
            You can customize the generation prompt or let AI create it automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Suggestion Preview */}
          <div className="p-4 bg-muted/50 rounded-lg border">
            <h4 className="font-semibold text-sm text-muted-foreground mb-2">
              AI Suggestion:
            </h4>
            <h3 className="font-bold mb-2">{suggestionTitle}</h3>
            {suggestionDescription && (
              <p className="text-sm text-muted-foreground">{suggestionDescription}</p>
            )}
          </div>

          {/* Custom Prompt (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="custom-prompt">
              Custom Instructions (Optional)
            </Label>
            <Textarea
              id="custom-prompt"
              placeholder="Add any specific requirements, tone, or focus areas for the article..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default article generation prompt.
            </p>
          </div>

          {/* Generation Info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>What happens next:</strong> AI will generate a comprehensive article 
              (800-1500 words) with SEO optimization, proper structure, and engaging content. 
              The article will be saved as a draft for you to review and publish.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateArticle}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Article
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateArticleButton;
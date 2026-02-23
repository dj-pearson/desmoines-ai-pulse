import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, X } from 'lucide-react';
import { storage } from '@/lib/safeStorage';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const log = createLogger('EmailCaptureModal');

const DISMISS_KEY = 'email_capture_dismissed';

interface EmailCaptureModalProps {
  /** Controls visibility */
  open: boolean;
  /** Called when the modal is closed (either submitted or dismissed) */
  onOpenChange: (open: boolean) => void;
  /** Source context, e.g. "trip_planner" or "event_promotion_planner" */
  source?: string;
}

/**
 * Modal that captures email addresses from users of free tools.
 *
 * - Dismissible with "do not show again" option stored via safeStorage
 * - Stores leads in the `event_promotion_email_captures` table
 * - Links to /privacy-policy for proper disclosure
 */
export function EmailCaptureModal({ open, onOpenChange, source = 'general' }: EmailCaptureModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Don't render at all if the user previously dismissed permanently
  const wasDismissed = storage.get<boolean>(DISMISS_KEY);
  if (wasDismissed && !open) return null;

  const handleDismiss = () => {
    storage.set(DISMISS_KEY, true);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !consent) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('event_promotion_email_captures')
        .insert({
          email,
          event_type: source,
          event_date: new Date().toISOString().split('T')[0],
          event_name: name || null,
          organization_name: null,
        });

      if (error) {
        log.warn('handleSubmit', 'Failed to save email lead', { error: error.message });
      }

      toast({
        title: 'Thanks for subscribing!',
        description: "You'll receive Des Moines insider tips and updates.",
      });

      storage.set(DISMISS_KEY, true);
      onOpenChange(false);
    } catch (err) {
      log.error('handleSubmit', 'Unexpected error saving lead', { data: err });
      toast({
        title: 'Something went wrong',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            Get Des Moines Insider Tips
          </DialogTitle>
          <DialogDescription>
            Get the best events, restaurants, and hidden gems delivered to your inbox weekly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="capture-email">Email address *</Label>
            <Input
              id="capture-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capture-name">Name (optional)</Label>
            <Input
              id="capture-name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="capture-consent"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />
            <Label htmlFor="capture-consent" className="text-sm text-muted-foreground leading-tight">
              I agree to receive occasional emails about Des Moines events and tips.
              See our{' '}
              <Link to="/privacy-policy" className="text-primary underline" target="_blank">
                Privacy Policy
              </Link>.
            </Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={!consent || !email || isSubmitting}>
              {isSubmitting ? 'Subscribing...' : 'Subscribe'}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={handleDismiss} aria-label="Dismiss and don't show again">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            No spam, unsubscribe anytime.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

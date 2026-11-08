import { useState } from 'react';
import { MailX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNewsletterSubscription } from '@/hooks/useNewsletterSubscription';

interface ReminderEmailsUnsubscribedNoticeProps {
  /** The signed-in user's address; the resubscribe button needs it. */
  email: string | null | undefined;
}

/**
 * WEB-FEAT-065. Event reminders are marketing mail and follow the newsletter
 * unsubscribe, so for this reader none will arrive. Say so, and offer the one
 * way back: a newsletter signup, whose confirm click lifts the suppression
 * (migration 20261108000037). That also restarts the weekly email, and the
 * copy says that rather than hiding it.
 */
export function ReminderEmailsUnsubscribedNotice({ email }: ReminderEmailsUnsubscribedNoticeProps) {
  const { subscribe, loading } = useNewsletterSubscription();
  const [sent, setSent] = useState(false);

  const resubscribe = async () => {
    if (!email) return;
    const ok = await subscribe({ email, source: 'website' });
    if (ok) setSent(true);
  };

  return (
    <div role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <MailX className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span>You unsubscribed from our emails, so we won't email these reminders.</span>
      </p>
      {sent ? (
        <p className="mt-2 text-muted-foreground">
          Check your inbox for a confirmation link. Reminders start once you click it.
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Resubscribing turns reminders back on, along with our weekly email.
          </p>
          {email && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={resubscribe}
              disabled={loading}
            >
              {loading ? 'Sending link...' : 'Resubscribe'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

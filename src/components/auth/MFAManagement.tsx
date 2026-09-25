import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { useMFA, useMFAFactors, type MFAFactor } from '@/hooks/useMFA';
import { MFAEnrollmentDialog } from './MFAEnrollmentDialog';
import { Shield, Trash2, Plus, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * Two-step sign-in (account plan WP5 item 7).
 *
 * Everything on this card comes from one listFactors() call through
 * useMFAFactors, shared with SecurityCheckup. It used to make two calls on
 * mount and a third after every change.
 */
export function MFAManagement() {
  const { summary, isLoading, isError, error, refetch } = useMFAFactors();
  const { unenrollFactor, isLoading: isChanging } = useMFA();

  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<MFAFactor | null>(null);

  const verified = summary.verified;
  const mfaEnabled = verified.length > 0;

  const handleUnenroll = async () => {
    if (!pendingRemoval) return;
    const success = await unenrollFactor(pendingRemoval.id, {
      wasVerified: pendingRemoval.status === 'verified',
    });
    if (success) setPendingRemoval(null);
  };

  const removingLastVerified =
    pendingRemoval?.status === 'verified' && verified.length === 1;

  return (
    <>
      <Card id="two-step">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" aria-hidden="true" />
                Two-step sign-in
              </CardTitle>
              <CardDescription>
                After your password, we ask for a six-digit code from an authenticator app.
              </CardDescription>
            </div>
            {mfaEnabled && <Badge variant="secondary">On</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading authenticators" />
            </div>
          ) : isError ? (
            <ErrorState
              compact
              error={error}
              title="Couldn't load your authenticators"
              onRetry={() => void refetch()}
            />
          ) : summary.all.length > 0 ? (
            <ul className="space-y-3" aria-label="Your authenticators">
              {summary.all.map((factor) => (
                <li
                  key={factor.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{factor.friendly_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {factor.status === 'verified'
                        ? `Added ${formatDistanceToNow(new Date(factor.created_at), { addSuffix: true })}`
                        : 'Setup was not finished'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingRemoval(factor)}
                    disabled={isChanging}
                    aria-label={
                      factor.status === 'verified'
                        ? `Remove ${factor.friendly_name}`
                        : `Remove unfinished setup ${factor.friendly_name}`
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not set up. Anyone with your password can sign in as you.
            </p>
          )}

          {mfaEnabled && verified.length === 1 && (
            <p className="text-sm text-muted-foreground">
              Add a second authenticator on another device as your backup. Without one, losing this
              phone locks you out until you reset your password by email.
            </p>
          )}

          <Button
            onClick={() => setEnrollDialogOpen(true)}
            disabled={isChanging || isLoading || isError}
            className="w-full sm:w-auto"
            variant={mfaEnabled ? 'outline' : 'default'}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {mfaEnabled ? 'Add a backup authenticator' : 'Turn on two-step sign-in'}
          </Button>
        </CardContent>
      </Card>

      <MFAEnrollmentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        existingFactors={summary.all}
      />

      <AlertDialog open={!!pendingRemoval} onOpenChange={(next) => !next && setPendingRemoval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoval?.status === 'verified'
                ? `Remove ${pendingRemoval.friendly_name}?`
                : 'Remove the unfinished setup?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.status !== 'verified'
                ? 'This authenticator was never verified, so it has never protected your account. Removing it changes nothing about how you sign in.'
                : removingLastVerified
                  ? 'This is your only authenticator. After removing it you will sign in with just your password, and we will email you to confirm.'
                  : 'Codes from this device will stop working. Your other authenticators keep working, and we will email you to confirm.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleUnenroll();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

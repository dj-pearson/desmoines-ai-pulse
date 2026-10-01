import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFAVerificationDialog');

const MAX_ATTEMPTS = 5;
const LOCKOUT_CLOSE_MS = 3000;
const CODE_LENGTH = 6;

interface MFAVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The TOTP factor to challenge. Optional: without one the dialog looks up the
   * account's verified TOTP factor itself, which is what lets /auth finish a
   * second factor for a Google or Apple sign-in, or after a reload between the
   * password and the code (account plan WP1 item 4).
   */
  factorId?: string | null;
  /** The code was accepted and the session is now aal2. */
  onSuccess?: () => void;
  /**
   * The person gave up: the Cancel button, Escape, a click outside, or the
   * lockout after too many wrong codes. NEVER called after a correct code.
   */
  onCancel?: () => void;
}

/** GoTrue's code for a challenge that outlived its window. */
function isExpiredChallenge(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'mfa_challenge_expired') return true;
  return /challenge.*expired|expired.*challenge/i.test(error.message ?? '');
}

/**
 * Second-factor prompt during sign-in.
 *
 * WHY CLOSE AND CANCEL ARE SEPARATE (WP1 item 1). Both success paths used to
 * call a single handleClose, and handleClose always called onCancel. /auth
 * wires onCancel to "end this aal1 session", so a CORRECT code signed the
 * person straight back out and toasted "Login Cancelled". resetState is now the
 * shared part; onCancel runs only when the person actually cancels.
 */
export function MFAVerificationDialog({
  open,
  onOpenChange,
  factorId,
  onSuccess,
  onCancel,
}: MFAVerificationDialogProps) {
  const [resolvedFactorId, setResolvedFactorId] = useState<string | null>(factorId ?? null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Auto-submit on the sixth digit and Enter/Verify can race for the same
  // challenge. The second request would fail (a challenge verifies once) and
  // count as a wrong code. A ref, not state, because both fire in one tick.
  const inFlightRef = useRef(false);
  const lockoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    if (lockoutTimerRef.current) {
      clearTimeout(lockoutTimerRef.current);
      lockoutTimerRef.current = null;
    }
    inFlightRef.current = false;
    setChallengeId(null);
    setVerificationCode('');
    setAttempts(0);
    setError(null);
    setIsVerifying(false);
  }, []);

  useEffect(() => () => {
    if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
  }, []);

  useEffect(() => {
    setResolvedFactorId(factorId ?? null);
  }, [factorId]);

  const startChallenge = useCallback(async (id: string): Promise<boolean> => {
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: id });
    if (challengeError || !data?.id) {
      log.error('challenge', 'Failed to create MFA challenge', { data: challengeError });
      setError("We couldn't start the check. Close this and sign in again.");
      return false;
    }
    setChallengeId(data.id);
    return true;
  }, []);

  // Resolve the factor (when none was passed) and open a challenge.
  useEffect(() => {
    if (!open || challengeId) return;
    let cancelled = false;

    const prepare = async () => {
      setIsPreparing(true);
      try {
        let id = resolvedFactorId;
        if (!id) {
          const { data, error: listError } = await supabase.auth.mfa.listFactors();
          if (listError) {
            log.error('listFactors', 'Could not list MFA factors', { data: listError });
          }
          id = data?.totp?.find((factor) => factor.status === 'verified')?.id ?? null;
          if (cancelled) return;
          if (!id) {
            setError("We couldn't find an authenticator for this account. Close this and sign in again.");
            return;
          }
          setResolvedFactorId(id);
        }
        if (!cancelled) await startChallenge(id);
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [open, challengeId, resolvedFactorId, startChallenge]);

  const cancel = useCallback(() => {
    resetState();
    onOpenChange(false);
    onCancel?.();
  }, [resetState, onOpenChange, onCancel]);

  const verify = useCallback(async (code: string) => {
    if (inFlightRef.current) return;
    if (!challengeId || !resolvedFactorId) {
      setError('Still getting ready. Try again in a second.');
      return;
    }
    if (code.length !== CODE_LENGTH || attempts >= MAX_ATTEMPTS) return;

    inFlightRef.current = true;
    setIsVerifying(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: resolvedFactorId,
        challengeId,
        code,
      });

      if (!verifyError) {
        // Success: close WITHOUT onCancel. mfa.verify resolving with no error
        // means GoTrue accepted the code and the stored session is now aal2.
        resetState();
        onOpenChange(false);
        onSuccess?.();
        return;
      }

      if (isExpiredChallenge(verifyError)) {
        // Not the person's mistake, so not an attempt. A fresh challenge and
        // the code they already have is usually still good.
        setVerificationCode('');
        setError('That check timed out. Enter the code your app shows now.');
        await startChallenge(resolvedFactorId);
        return;
      }

      const next = attempts + 1;
      setAttempts(next);
      setVerificationCode('');

      if (next >= MAX_ATTEMPTS) {
        setError('Too many wrong codes. Sign in again to get a new check.');
        lockoutTimerRef.current = setTimeout(cancel, LOCKOUT_CLOSE_MS);
      } else {
        setError("That code didn't match. Codes change every 30 seconds, so use the current one.");
      }
    } catch (err) {
      log.error('verify', 'MFA verification threw', { data: err });
      setVerificationCode('');
      setError("We couldn't check that code. Try again.");
    } finally {
      inFlightRef.current = false;
      setIsVerifying(false);
    }
  }, [attempts, cancel, challengeId, onOpenChange, onSuccess, resetState, resolvedFactorId, startChallenge]);

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setVerificationCode(cleaned);
    setError(null);
    if (cleaned.length === CODE_LENGTH) {
      void verify(cleaned);
    }
  };

  const lockedOut = attempts >= MAX_ATTEMPTS;
  const busy = isPreparing || isVerifying;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Radix calls this with false for Escape, a click outside and the close
        // button - all of which are the person cancelling.
        if (!next) cancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
            Two-step sign-in
          </DialogTitle>
          <DialogDescription>
            Enter the 6-digit code from your authenticator app.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(verificationCode);
          }}
        >
          {isPreparing && !challengeId ? (
            <div className="flex items-center justify-center py-8" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Getting ready</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Code</Label>
              <Input
                id="mfa-code"
                name="one-time-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="text-center text-2xl tracking-widest font-mono tabular-nums"
                autoFocus
                disabled={lockedOut}
                aria-invalid={!!error}
                aria-describedby={error ? 'mfa-code-error' : undefined}
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive" id="mfa-code-error">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {attempts > 0 && !lockedOut && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {MAX_ATTEMPTS - attempts} {MAX_ATTEMPTS - attempts === 1 ? 'try' : 'tries'} left.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Lost your authenticator? Contact support to get back into your account.
          </p>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || verificationCode.length !== CODE_LENGTH || lockedOut}
            >
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Verify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

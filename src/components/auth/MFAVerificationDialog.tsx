import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMFA } from '@/hooks/useMFA';
import { Loader2, Shield, AlertCircle } from 'lucide-react';

interface MFAVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factorId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * MFA Verification Dialog Component
 *
 * Used during login to verify the second factor (TOTP code)
 * Appears after successful password authentication when MFA is enabled
 */
export function MFAVerificationDialog({
  open,
  onOpenChange,
  factorId,
  onSuccess,
  onCancel,
}: MFAVerificationDialogProps) {
  const { createChallenge, verifyChallenge, isLoading } = useMFA();

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Create challenge when dialog opens
  useEffect(() => {
    if (open && factorId && !challengeId) {
      createChallenge(factorId)
        .then(setChallengeId)
        .catch((error) => {
          console.error('Failed to create MFA challenge:', error);
          setError('Failed to initialize authentication. Please try again.');
        });
    }
  }, [open, factorId, challengeId, createChallenge]);

  const handleVerify = async () => {
    if (!challengeId || !factorId) {
      setError('Challenge not initialized. Please try again.');
      return;
    }

    setError(null);
    const success = await verifyChallenge(factorId, challengeId, verificationCode);

    if (success) {
      onSuccess?.();
      handleClose();
    } else {
      setAttempts(prev => prev + 1);
      setVerificationCode('');
      setError('Invalid code. Please try again.');

      // Lock after 5 failed attempts
      if (attempts >= 4) {
        setError('Too many failed attempts. Please try again later.');
        setTimeout(() => {
          handleClose();
        }, 3000);
      }
    }
  };

  const handleClose = () => {
    setVerificationCode('');
    setChallengeId(null);
    setAttempts(0);
    setError(null);
    onOpenChange(false);
    onCancel?.();
  };

  const handleCodeChange = (value: string) => {
    const cleanedValue = value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(cleanedValue);
    setError(null);

    // Auto-submit when 6 digits entered
    if (cleanedValue.length === 6) {
      // Small delay to show the last digit
      setTimeout(() => {
        if (challengeId && factorId) {
          verifyChallenge(factorId, challengeId, cleanedValue)
            .then(success => {
              if (success) {
                onSuccess?.();
                handleClose();
              } else {
                setAttempts(prev => prev + 1);
                setVerificationCode('');
                setError('Invalid code. Please try again.');
              }
            })
            .catch((error) => {
              console.error('MFA verification failed:', error);
              setAttempts(prev => prev + 1);
              setVerificationCode('');
              setError('Verification failed. Please try again.');
            });
        }
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            Enter the 6-digit code from your authenticator app
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!challengeId && isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Authentication Code</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                  disabled={isLoading || attempts >= 5}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Open your authenticator app to get the code
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {attempts > 0 && attempts < 5 && (
                <Alert>
                  <AlertDescription className="text-xs">
                    {5 - attempts} attempt{5 - attempts !== 1 ? 's' : ''} remaining
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Lost access?</strong> Contact support to regain access to your account.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleVerify}
            disabled={isLoading || verificationCode.length !== 6 || attempts >= 5}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

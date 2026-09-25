import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMFA, nextAuthenticatorName, type EnrollmentData, type MFAFactor } from '@/hooks/useMFA';
import { Loader2, Shield, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MFAEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Factors already on the account, verified or not, for the default name. */
  existingFactors?: MFAFactor[];
}

type Step = 'name' | 'verify' | 'backup';

/**
 * Set up an authenticator app (account plan WP5 item 7).
 *
 * 1. Name the device. Every factor used to be called "Authenticator App" and
 *    GoTrue rejects a duplicate friendly name, so adding a second one failed.
 * 2. Scan the QR code (or type the key) and enter a code to verify.
 * 3. After the FIRST authenticator, suggest a second one as the backup.
 *    Supabase TOTP has no backup codes; the old copy told people to save some.
 *
 * Closing half way removes the unverified enrolment, so the next attempt starts
 * clean instead of tripping over a half-created factor.
 */
export function MFAEnrollmentDialog({
  open,
  onOpenChange,
  onSuccess,
  existingFactors = [],
}: MFAEnrollmentDialogProps) {
  const { toast } = useToast();
  const { enrollTOTP, verifyEnrollment, clearUnverifiedFactors, isLoading } = useMFA();

  const [step, setStep] = useState<Step>('name');
  const [deviceName, setDeviceName] = useState('');
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [verifiedNames, setVerifiedNames] = useState<string[]>([]);

  const verifiedBefore = existingFactors.filter((f) => f.status === 'verified');

  useEffect(() => {
    if (open && step === 'name' && !deviceName) {
      setDeviceName(
        nextAuthenticatorName([
          ...verifiedBefore,
          ...verifiedNames.map((name) => ({ friendly_name: name }) as MFAFactor),
        ]),
      );
    }
    // Only when the dialog opens or returns to the naming step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const reset = () => {
    setStep('name');
    setDeviceName('');
    setEnrollmentData(null);
    setVerificationCode('');
    setCopiedSecret(false);
    setVerifiedNames([]);
  };

  const handleClose = () => {
    // A QR code was shown and never verified: remove that factor now.
    if (step === 'verify' && enrollmentData) {
      void clearUnverifiedFactors();
    }
    reset();
    onOpenChange(false);
  };

  const handleEnroll = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const data = await enrollTOTP(deviceName);
    if (data) {
      setEnrollmentData(data);
      setStep('verify');
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!enrollmentData) return;

    const success = await verifyEnrollment(enrollmentData.factorId, verificationCode);
    if (!success) return;

    onSuccess?.();
    const firstEver = verifiedBefore.length === 0 && verifiedNames.length === 0;
    setVerifiedNames((prev) => [...prev, deviceName]);
    setEnrollmentData(null);
    setVerificationCode('');
    if (firstEver) {
      setStep('backup');
    } else {
      reset();
      onOpenChange(false);
    }
  };

  const startBackup = () => {
    setDeviceName(
      nextAuthenticatorName([
        ...verifiedBefore,
        ...verifiedNames.map((name) => ({ friendly_name: name }) as MFAFactor),
      ]),
    );
    setStep('name');
  };

  const handleCopySecret = async () => {
    if (!enrollmentData?.secret) return;

    try {
      await navigator.clipboard.writeText(enrollmentData.secret);
      setCopiedSecret(true);
      toast({ title: 'Setup key copied' });
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: 'Select the key and copy it by hand.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
            {step === 'backup' ? 'Add a backup authenticator?' : 'Set up an authenticator app'}
          </DialogTitle>
          <DialogDescription>
            {step === 'name' && 'Give this device a name you will recognise later, like "Work phone".'}
            {step === 'verify' && 'Scan the code with your app, then enter the six digits it shows.'}
            {step === 'backup' &&
              'If you lose this phone you will need another way in. Add a second authenticator on a different device as your backup.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'name' && (
          <form id="mfa-name-form" onSubmit={handleEnroll} className="space-y-2">
            <Label htmlFor="mfa-device-name">Device name</Label>
            <Input
              id="mfa-device-name"
              value={deviceName}
              maxLength={60}
              onChange={(e) => setDeviceName(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              Works with Google Authenticator, Authy, 1Password, Apple Passwords and similar apps.
            </p>
          </form>
        )}

        {step === 'verify' && enrollmentData && (
          <form id="mfa-verify-form" onSubmit={handleVerify} className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border bg-white p-4">
                <img
                  src={enrollmentData.qrCode}
                  alt={`QR code to add ${deviceName} to your authenticator app`}
                  className="h-48 w-48"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret-key">Can't scan? Type this key into the app</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="secret-key"
                  value={enrollmentData.secret}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleCopySecret}
                  aria-label={copiedSecret ? 'Setup key copied' : 'Copy setup key'}
                >
                  {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification-code">Six-digit code from the app</Label>
              <Input
                id="verification-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
          </form>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {step === 'backup' ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Not now
              </Button>
              <Button type="button" onClick={startBackup}>
                Add a backup
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              {step === 'name' ? (
                <Button type="submit" form="mfa-name-form" disabled={isLoading || !deviceName.trim()}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  form="mfa-verify-form"
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify and turn on
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

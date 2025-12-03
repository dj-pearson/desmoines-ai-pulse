import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMFA, type EnrollmentData } from '@/hooks/useMFA';
import { Loader2, Shield, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MFAEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * MFA Enrollment Dialog Component
 *
 * Guides users through the process of setting up two-factor authentication:
 * 1. Display QR code for scanning with authenticator app
 * 2. Show manual setup key as fallback
 * 3. Verify setup with a test code
 *
 * Compatible with: Google Authenticator, Authy, 1Password, Apple Keychain
 */
export function MFAEnrollmentDialog({ open, onOpenChange, onSuccess }: MFAEnrollmentDialogProps) {
  const { toast } = useToast();
  const { enrollTOTP, verifyEnrollment, isLoading } = useMFA();

  const [step, setStep] = useState<'enroll' | 'verify'>('enroll');
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleEnroll = async () => {
    const data = await enrollTOTP('Authenticator App');
    if (data) {
      setEnrollmentData(data);
      setStep('verify');
    }
  };

  const handleVerify = async () => {
    if (!enrollmentData) return;

    const success = await verifyEnrollment(enrollmentData.factorId, verificationCode);
    if (success) {
      onSuccess?.();
      handleClose();
    }
  };

  const handleCopySecret = async () => {
    if (!enrollmentData?.secret) return;

    try {
      await navigator.clipboard.writeText(enrollmentData.secret);
      setCopiedSecret(true);
      toast({
        title: 'Secret Copied',
        description: 'The setup key has been copied to your clipboard',
      });
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setStep('enroll');
    setEnrollmentData(null);
    setVerificationCode('');
    setCopiedSecret(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Enable Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {step === 'enroll'
              ? 'Secure your account with an authenticator app'
              : 'Enter the code from your authenticator app to complete setup'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'enroll' && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                You'll need an authenticator app like Google Authenticator, Authy, 1Password, or Apple Keychain.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Steps to enable MFA:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Download an authenticator app if you don't have one</li>
                <li>Click "Generate QR Code" below</li>
                <li>Scan the QR code with your authenticator app</li>
                <li>Enter the 6-digit code from the app to verify</li>
              </ol>
            </div>
          </div>
        )}

        {step === 'verify' && enrollmentData && (
          <div className="space-y-4">
            {/* QR Code Display */}
            <div className="flex flex-col items-center space-y-3">
              <div className="p-4 bg-white rounded-lg border-2 border-gray-200">
                <img
                  src={enrollmentData.qrCode}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
              </div>

              <p className="text-sm text-center text-muted-foreground">
                Scan this QR code with your authenticator app
              </p>
            </div>

            {/* Manual Setup Key */}
            <div className="space-y-2">
              <Label htmlFor="secret-key" className="text-sm">
                Can't scan? Enter this key manually:
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="secret-key"
                  value={enrollmentData.secret}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopySecret}
                  disabled={copiedSecret}
                >
                  {copiedSecret ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Verification Code Input */}
            <div className="space-y-2">
              <Label htmlFor="verification-code">
                Enter the 6-digit code from your app:
              </Label>
              <Input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                <strong>Important:</strong> Save your backup codes after setup. You'll need them if you lose access to your authenticator app.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          {step === 'enroll' ? (
            <Button
              type="button"
              onClick={handleEnroll}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate QR Code
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleVerify}
              disabled={isLoading || verificationCode.length !== 6}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify and Enable
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

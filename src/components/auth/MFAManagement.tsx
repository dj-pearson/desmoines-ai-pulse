import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useMFA, type MFAFactor } from '@/hooks/useMFA';
import { MFAEnrollmentDialog } from './MFAEnrollmentDialog';
import { Shield, ShieldCheck, ShieldAlert, Trash2, Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/**
 * MFA Management Component
 *
 * Provides a UI for users to:
 * - View all enrolled MFA factors
 * - Enable new MFA factors
 * - Disable existing MFA factors
 * - See MFA status and security level
 */
export function MFAManagement() {
  const { factors, listFactors, unenrollFactor, isLoading, hasMFAEnabled } = useMFA();

  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [unenrollDialogOpen, setUnenrollDialogOpen] = useState(false);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Load factors on mount
  useEffect(() => {
    loadFactors();
  }, []);

  const loadFactors = async () => {
    await listFactors();
    const enabled = await hasMFAEnabled();
    setMfaEnabled(enabled);
  };

  const handleUnenroll = async () => {
    if (!selectedFactorId) return;

    const success = await unenrollFactor(selectedFactorId);
    if (success) {
      await loadFactors();
      setUnenrollDialogOpen(false);
      setSelectedFactorId(null);
    }
  };

  const handleEnrollSuccess = async () => {
    await loadFactors();
  };

  const getFactorIcon = (status: string) => {
    if (status === 'verified') {
      return <ShieldCheck className="h-5 w-5 text-green-600" />;
    }
    return <ShieldAlert className="h-5 w-5 text-yellow-600" />;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </div>

            {mfaEnabled && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Security Status Alert */}
          {!mfaEnabled ? (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Recommended:</strong> Enable two-factor authentication to protect your account from unauthorized access.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-green-200 bg-green-50">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Your account is protected with two-factor authentication.
              </AlertDescription>
            </Alert>
          )}

          {/* Enrolled Factors List */}
          {isLoading && factors.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : factors.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Enrolled Authenticators</h4>
              {factors.map((factor: MFAFactor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    {getFactorIcon(factor.status)}
                    <div>
                      <p className="font-medium">{factor.friendly_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {formatDistanceToNow(new Date(factor.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={factor.status === 'verified' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {factor.status}
                    </Badge>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFactorId(factor.id);
                        setUnenrollDialogOpen(true);
                      }}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No authenticators enrolled</p>
            </div>
          )}

          {/* Add Factor Button */}
          <Button
            onClick={() => setEnrollDialogOpen(true)}
            disabled={isLoading}
            className="w-full"
            variant={factors.length === 0 ? 'default' : 'outline'}
          >
            <Plus className="mr-2 h-4 w-4" />
            {factors.length === 0 ? 'Enable Two-Factor Authentication' : 'Add Another Authenticator'}
          </Button>

          {/* Information */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium">How it works:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Download an authenticator app (Google Authenticator, Authy, etc.)</li>
              <li>Scan the QR code or enter the setup key</li>
              <li>Enter the 6-digit code from the app to verify</li>
              <li>Use the code every time you log in</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Enrollment Dialog */}
      <MFAEnrollmentDialog
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
        onSuccess={handleEnrollSuccess}
      />

      {/* Unenroll Confirmation Dialog */}
      <AlertDialog open={unenrollDialogOpen} onOpenChange={setUnenrollDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this authenticator from your account. You'll only need your password to log in.
              This makes your account less secure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedFactorId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnenroll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable MFA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

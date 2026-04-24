/**
 * PrivacyControls
 *
 * Self-service privacy panel for logged-in users. Implements the core data
 * subject rights required by modern privacy laws:
 *
 *  - Right to access / portability — download a machine-readable copy of your
 *    personal data (CCPA/CPRA §1798.100, §1798.130; GDPR Art. 15, 20;
 *    VCDPA, CPA, CTDPA equivalents).
 *  - Right to delete — fully erase your account and associated personal data
 *    (CCPA §1798.105; GDPR Art. 17; Apple App Store Review §5.1.1(v)).
 *  - Right to opt out of "sale/sharing" / targeted advertising — managed via
 *    the cookie consent banner; we reference it here for discoverability.
 *
 * Notes:
 *  - Deletion uses the two-step confirmation-token flow exposed by the
 *    delete-user-account edge function (SEC-025). The server generates a
 *    token, and the same client confirms it to prevent CSRF-style mistakes.
 *  - Export pulls the user's own rows from tables readable to them via RLS.
 *    Data we legitimately need to retain (invoices for tax purposes) is not
 *    purged by the "delete" flow; we disclose this in the Privacy Policy.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  Download,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export function PrivacyControls() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "requested" | "deleting">(
    "idle"
  );
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      // Fetch the data that is user-scoped. RLS enforces that a signed-in user
      // can only read their own rows, so this is safe without extra filters.
      // We query each table independently so that a missing table or permission
      // error on one doesn't block the whole export.
      const tables = [
        "profiles",
        "user_event_interactions",
        "user_restaurant_interactions",
        "favorites",
        "ratings",
        "reviews",
        "user_subscriptions",
      ];

      const exported: Record<string, unknown> = {
        export_meta: {
          user_id: user.id,
          email: user.email,
          generated_at: new Date().toISOString(),
          format_version: "1.0",
          notice:
            "This export contains personal data we hold about your account. Certain records we are legally required to retain (e.g., invoices for tax purposes) may not be included; see our Privacy Policy for retention details.",
        },
      };

      for (const table of tables) {
        try {
          const { data, error } = await supabase
            .from(table)
            // @ts-expect-error — user_id column present on all tables above
            .select("*")
            .eq("user_id", user.id);
          exported[table] = error ? { error: error.message } : data ?? [];
        } catch (err) {
          exported[table] = {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `desmoines-insider-data-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export ready",
        description:
          "Your personal data was downloaded as a JSON file. Keep it somewhere safe.",
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong preparing your export. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const requestDeletion = async () => {
    if (!user) return;
    setDeleteStep("requested");
    try {
      const { data, error } = await supabase.functions.invoke(
        "delete-user-account",
        {
          body: { action: "request" },
        }
      );
      if (error) throw error;
      const token = (data as { confirmation_token?: string })?.confirmation_token;
      if (!token) {
        throw new Error("Server did not return a confirmation token.");
      }
      setConfirmationToken(token);
    } catch (err) {
      setDeleteStep("idle");
      toast({
        title: "Could not start deletion",
        description:
          err instanceof Error
            ? err.message
            : "Please try again or contact privacy@desmoinesinsider.com.",
        variant: "destructive",
      });
    }
  };

  const confirmDeletion = async () => {
    if (!confirmationToken) return;
    setDeleteStep("deleting");
    try {
      const { error } = await supabase.functions.invoke("delete-user-account", {
        body: { action: "confirm", confirmation_token: confirmationToken },
      });
      if (error) throw error;

      toast({
        title: "Account deleted",
        description:
          "Your account and associated personal data have been permanently deleted.",
      });
      // Sign out locally; the server-side auth record is already gone.
      await logout();
      window.location.href = "/";
    } catch (err) {
      setDeleteStep("requested");
      toast({
        title: "Deletion failed",
        description:
          err instanceof Error
            ? err.message
            : "Your token may have expired. Please request a new one.",
        variant: "destructive",
      });
    }
  };

  const cancelDeletion = () => {
    setDeleteStep("idle");
    setConfirmationToken(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy &amp; Data Controls
        </CardTitle>
        <CardDescription>
          Exercise your privacy rights under the CCPA, GDPR, and other applicable
          laws. These actions apply to your Des Moines Insider account only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Download
              className="h-5 w-5 text-primary mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                Download your data
              </h3>
              <p className="text-sm text-muted-foreground">
                Get a machine-readable JSON copy of the profile, preferences,
                favorites, reviews, and subscription records we hold about your
                account.
              </p>
            </div>
          </div>
          <div>
            <Button
              onClick={handleExport}
              disabled={isExporting || !user}
              variant="outline"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing export...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download my data
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Opt-out cross-link */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="h-5 w-5 text-primary mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                Do Not Sell or Share My Personal Information
              </h3>
              <p className="text-sm text-muted-foreground">
                We do not sell personal information for money. We do allow some
                third-party analytics and advertising partners to process site
                activity, which may be considered &quot;sharing&quot; under the
                CCPA/CPRA. You can turn this off from the cookie preferences
                panel, and we automatically honor the Global Privacy Control
                (GPC) signal.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/cookie-policy">Manage cookie preferences</Link>
          </Button>
        </div>

        {/* Delete */}
        <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Trash2
              className="h-5 w-5 text-destructive mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                Delete my account
              </h3>
              <p className="text-sm text-muted-foreground">
                Permanently erase your account and the personal data associated
                with it. This cannot be undone. Records we are legally required
                to keep (for example, invoices for tax purposes) will be
                retained in a minimized form as described in our{" "}
                <Link to="/privacy-policy" className="underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>

          {deleteStep === "idle" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete my account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete your account permanently?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm">
                      <p>
                        This will permanently remove your profile, favorites,
                        reviews, ratings, submitted events, and subscription
                        records. Active paid subscriptions will be canceled, but
                        any refunds will follow the policy in our Terms of
                        Service.
                      </p>
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          This action cannot be reversed. You will need to
                          create a new account to use Des Moines Insider again.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep my account</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={requestDeletion}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {deleteStep === "requested" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p>
                  We generated a 15-minute confirmation token. Click
                  &quot;Confirm deletion&quot; below to finish permanently
                  deleting your account, or Cancel to abort.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={cancelDeletion}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={confirmDeletion}>
                    Confirm deletion
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {deleteStep === "deleting" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Deleting your account and associated data...
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PrivacyControls;

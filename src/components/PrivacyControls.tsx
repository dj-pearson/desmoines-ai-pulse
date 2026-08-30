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
import { reopenConsentBanner } from "@/components/CookieConsentBanner";
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
      //
      // THREE OF THESE NAMES WERE WRONG AND THE INDEPENDENT-QUERY DESIGN HID IT
      // (XPLAT-007). `favorites`, `ratings` and `reviews` do not exist - all
      // three answer 42P01 - so a user exercising their right of access received
      // an export with three error strings where their favourites, ratings and
      // reviews should have been. The real tables are content_favorites,
      // user_ratings and event_reviews, and all three are in the erasure path's
      // PURGE_TABLES, so we were deleting that data and declining to show it.
      // A right of access is not a right of erasure; data we hold is data the
      // user is entitled to see.
      //
      // THIS LIST IS STILL THE WRONG MECHANISM. It is eight names maintained by
      // hand against a schema that has renamed three of them already, while
      // supabase/functions/export-user-data walks all 62 entries of
      // PURGE_TABLES and is covered by user-data-tables.test.ts, which fails
      // when a table carrying user_id appears in neither list. That function is
      // built and NOT DEPLOYED (an anon POST answers 404), so this client-side
      // list is what a user actually gets. Point this at the function once it is
      // deployed and delete the list - do not grow the list.
      //
      // THE SIZE OF THE GAP, measured 2026-08-28 rather than estimated, because
      // "eight names" does not convey it. Against _shared/userDataTables.ts:
      //     62  PURGE_TABLES     rows we DELETE on request
      //      8  shown here
      //     54  deleted but never shown
      //     18  RETAINED_TABLES  kept with a stated legal basis, 0 shown
      // The 18 are the sharper half: data we decline to delete is data the user
      // is MORE entitled to see, not less.
      //
      // All 8 below were re-probed against production on 2026-08-28 and every
      // one returns 200 with a user_id column, so the three renamed names stay
      // fixed. export-user-data is still 404 - and it is safe to deploy on its
      // own: it has no config.toml entry, so verify_jwt defaults to true and it
      // is not among the 71 verify_jwt=false functions that deploy-edge-functions
      // deliberately withholds. Its erasure counterpart delete-user-account is
      // already live (401 on an anon POST).
      const tables = [
        "profiles",
        "user_event_interactions",
        "user_restaurant_interactions",
        "content_favorites",
        "user_ratings",
        "event_reviews",
        "user_subscriptions",
        "user_analytics",
      ];

      const exported: Record<string, unknown> = {
        export_meta: {
          user_id: user.id,
          email: user.email,
          generated_at: new Date().toISOString(),
          format_version: "1.0",
          // NAME WHAT IS COVERED. A user cannot tell a category they have no
          // data in from one this export does not read, and an export that
          // lists nothing implies it read everything.
          tables_included: tables,
          notice:
            "This export covers the record types listed in tables_included. It is not yet " +
            "a complete copy of every record associated with your account - a fuller export " +
            "is being prepared. Records we are legally required to retain (for example " +
            "invoices for tax purposes) are described in our Privacy Policy.",
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
                favorites, reviews, subscription, and usage-analytics records we
                hold about your account.
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
          <Button variant="outline" onClick={reopenConsentBanner}>
            Manage cookie preferences
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

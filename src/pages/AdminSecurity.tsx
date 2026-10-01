import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import BlockedEmailDomainsManager from "@/components/admin/BlockedEmailDomainsManager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

/**
 * Admin security settings (WEB-QUAL-008 AC2).
 *
 * WHAT THIS PAGE USED TO BE. AdminSecurityManager rendered five tabs, four of
 * which were mock-ups wired to a real admin route:
 *
 *   Settings       a maintenance-mode toggle that flipped useState and toasted
 *                  "Site is now in maintenance mode. Only admins can access",
 *                  plus a Save button that wrote to localStorage and said "All
 *                  security settings have been saved successfully". Nothing in
 *                  App.tsx or functions/_middleware.ts reads any of it.
 *   Monitoring     "Active Threats", "Blocked IPs" and "Security Events"
 *                  counters, computed from the mock arrays below.
 *   Access Control block/unblock IP, appending to a local array. The
 *                  blocked_ips table exists and nothing reads it either, so
 *                  wiring the UI to it would have moved the lie one layer down
 *                  rather than removing it.
 *   Security Logs  three hardcoded rows, including an "IP address"
 *                  203.0.113.45 and flagged words ["spam", "hack"].
 *
 * An admin could open this page, press a switch, read a confident confirmation
 * that the site was locked to admins, and be wrong. A security control that
 * reports success without acting is worse than no control: it is the one
 * screen someone checks during an incident.
 *
 * REMOVED rather than implemented, which is the option AC2 offers and the one
 * this takes. Backing maintenance mode properly means a system_settings read in
 * functions/_middleware.ts on EVERY request at the edge, and Cloudflare Pages -
 * where this deploys - already offers maintenance pages and IP rules at the
 * platform level. Re-implementing them in application code would duplicate
 * infrastructure with a slower, less reliable copy.
 *
 * WHAT SURVIVES is the one tab that was real: blocked email domains, which
 * queries a table that exists and is enforced at signup.
 */
export default function AdminSecurity() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("Security Settings");

  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);

  if (!canManageUsers()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access security settings.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6 space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Maintenance mode and IP blocking are not here</AlertTitle>
          <AlertDescription>
            Both are handled by Cloudflare, not by this application. Use the
            Cloudflare dashboard for a maintenance page or an IP rule. This page
            previously showed switches for them that changed nothing, so they
            were removed rather than left reporting success.
          </AlertDescription>
        </Alert>

        <BlockedEmailDomainsManager />
      </div>
    </div>
  );
}

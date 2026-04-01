import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Status = "loading" | "success" | "error";

export default function AdminGscCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Connecting to Google Search Console…");

  useEffect(() => {
    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCallback = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");

      if (oauthError) {
        throw new Error(`Google denied access: ${oauthError}`);
      }

      if (!code) {
        throw new Error("No authorization code received from Google.");
      }

      setMessage("Exchanging authorization code for tokens…");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in to connect Search Console.");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      // Forward the code to the gsc-oauth edge function (GET with query params)
      const callbackUrl = new URL(`${supabaseUrl}/functions/v1/gsc-oauth`);
      callbackUrl.searchParams.set("action", "callback");
      callbackUrl.searchParams.set("code", code);

      const tokenRes = await fetch(callbackUrl.toString(), {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({ error: tokenRes.statusText }));
        const detail = err.hint || err.error_description || err.error || "Token exchange failed.";
        throw new Error(detail);
      }

      const tokenJson = await tokenRes.json();
      const { credentialId } = tokenJson;

      setMessage("Fetching your Search Console properties…");

      // Use direct fetch so we can read the actual error body if it fails
      let count = 0;
      try {
        const propRes = await fetch(
          `${supabaseUrl}/functions/v1/gsc-fetch-properties`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: anonKey,
            },
            body: JSON.stringify({ credentialId }),
          }
        );

        const propJson = await propRes.json().catch(() => ({}));

        if (propRes.ok) {
          count = propJson.count ?? 0;
        } else {
          // Property fetch failed — credentials are saved, user can sync later
          console.warn(
            "gsc-fetch-properties failed (will retry on sync):",
            propJson.error || propRes.statusText
          );
        }
      } catch (propErr) {
        // Network-level failure — not critical, credentials are saved
        console.warn("gsc-fetch-properties network error:", propErr);
      }

      setStatus("success");
      setMessage(
        count > 0
          ? `Connected! Found ${count} propert${count === 1 ? "y" : "ies"}.`
          : "Connected! Properties will load on the dashboard."
      );
      toast.success("Google Search Console connected!", {
        description:
          count > 0
            ? `${count} propert${count === 1 ? "y" : "ies"} imported.`
            : "Click 'Sync Data' on the dashboard to load your properties.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed.";
      setStatus("error");
      setMessage(msg);
      toast.error("Failed to connect Google Search Console", { description: msg });
    } finally {
      setTimeout(() => navigate("/admin/analytics-dashboard"), 2500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md px-4">
        {status === "loading" && (
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
        )}
        {status === "error" && (
          <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
        )}
        <p className="text-lg font-semibold">{message}</p>
        <p className="text-sm text-muted-foreground">
          Redirecting to analytics dashboard…
        </p>
      </div>
    </div>
  );
}

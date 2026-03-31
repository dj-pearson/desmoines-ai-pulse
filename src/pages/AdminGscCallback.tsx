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

      const { data: propertiesData, error: propError } = await supabase.functions.invoke(
        "gsc-fetch-properties",
        { body: { credentialId } }
      );

      if (propError) throw new Error(propError.message || "Failed to fetch properties.");

      const count = propertiesData?.count ?? 0;
      setStatus("success");
      setMessage(`Connected! Found ${count} propert${count === 1 ? "y" : "ies"}.`);
      toast.success("Google Search Console connected!", {
        description: `${count} propert${count === 1 ? "y" : "ies"} imported.`,
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

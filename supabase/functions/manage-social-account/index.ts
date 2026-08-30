/**
 * Manage Social Account
 *
 * Admin-only CRUD + connection-test for rows in public.social_accounts.
 * Tokens are encrypted with AES-GCM using the SOCIAL_ACCOUNT_ENC_KEY
 * secret (base64-encoded 32-byte key). Plaintext tokens never leave
 * this function — admin clients read the safe shape via the
 * social_accounts_admin view.
 *
 * Routes (POST body { action: '…', … }):
 *   - list                  → returns the safe-view rows
 *   - create  { platform, handle, access_token, refresh_token?, token_expires_at?, notes? }
 *   - delete  { id }
 *   - rotate  { id, access_token, refresh_token?, token_expires_at? }
 *   - test    { id }        → makes a minimal API call, stamps last_validated_at / last_validation_error
 *
 * Story: ADMIN-SOCIAL-001
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handleCors,
  getCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { requireAdminOrApiKey, type AdminCaller } from "../_shared/apiKeyAuth.ts";

type Platform = "twitter" | "facebook" | "instagram" | "linkedin";

interface CreatePayload {
  platform: Platform;
  handle: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string | null;
  notes?: string | null;
}

interface RotatePayload {
  id: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string | null;
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64FromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function loadKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("SOCIAL_ACCOUNT_ENC_KEY");
  if (!raw) {
    throw new Error(
      "SOCIAL_ACCOUNT_ENC_KEY is not set. Generate a 32-byte key and store it via `supabase secrets set SOCIAL_ACCOUNT_ENC_KEY=<base64>`",
    );
  }
  const bytes = bytesFromBase64(raw);
  if (bytes.length !== 32) {
    throw new Error(
      "SOCIAL_ACCOUNT_ENC_KEY must decode to exactly 32 bytes (AES-256).",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(plaintext: string): Promise<string> {
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return base64FromBytes(combined);
}

async function decryptToken(b64: string): Promise<string> {
  const key = await loadKey();
  const combined = bytesFromBase64(b64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

/** Per-platform minimal verification call. Throws with a human message on failure. */
async function verifyToken(platform: Platform, token: string): Promise<void> {
  if (platform === "twitter") {
    // GET /2/users/me — returns 200 + user object when token is valid.
    const r = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Twitter /users/me returned HTTP ${r.status}`);
    return;
  }
  if (platform === "facebook") {
    // GET /me — Graph API debug call.
    const r = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`,
    );
    if (!r.ok) throw new Error(`Facebook /me returned HTTP ${r.status}`);
    return;
  }
  if (platform === "instagram") {
    // GET /me?fields=id,username on the Graph API (Instagram Basic Display).
    const r = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(token)}`,
    );
    if (!r.ok) throw new Error(`Instagram /me returned HTTP ${r.status}`);
    return;
  }
  if (platform === "linkedin") {
    // GET /v2/userinfo — OpenID Connect endpoint.
    const r = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`LinkedIn /userinfo returned HTTP ${r.status}`);
    return;
  }
  throw new Error(`Unknown platform: ${platform}`);
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(
    isOriginAllowed(origin) ? origin : undefined,
  );

  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: "Too many social-account operations.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // WEB-SEC-023: was a hand-rolled gate on profiles.role keyed by the row PK.
    const caller: AdminCaller = { user: null };
    const authFailure = await requireAdminOrApiKey(req, corsHeaders, caller);
    if (authFailure) return authFailure;

    // Connected accounts record created_by, so a shared key with no user
    // identity cannot drive this endpoint.
    const user = caller.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: "This endpoint requires an admin user session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;

    if (action === "list") {
      const { data, error } = await supabase
        .from("social_accounts_admin")
        .select("*")
        .order("platform", { ascending: true })
        .order("handle", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ accounts: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const p = body.payload as CreatePayload | undefined;
      if (!p || !p.platform || !p.handle || !p.access_token) {
        return new Response(
          JSON.stringify({ error: "platform, handle, access_token required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const encrypted = await encryptToken(p.access_token);
      const encryptedRefresh = p.refresh_token
        ? await encryptToken(p.refresh_token)
        : null;
      const { data, error } = await supabase
        .from("social_accounts")
        .insert({
          platform: p.platform,
          handle: p.handle,
          access_token_encrypted: encrypted,
          refresh_token_encrypted: encryptedRefresh,
          token_expires_at: p.token_expires_at ?? null,
          notes: p.notes ?? null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ id: data.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "rotate") {
      const p = body.payload as RotatePayload | undefined;
      if (!p?.id || !p.access_token) {
        return new Response(
          JSON.stringify({ error: "id and access_token required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const updates: Record<string, unknown> = {
        access_token_encrypted: await encryptToken(p.access_token),
      };
      if (p.refresh_token !== undefined) {
        updates.refresh_token_encrypted = p.refresh_token
          ? await encryptToken(p.refresh_token)
          : null;
      }
      if (p.token_expires_at !== undefined) {
        updates.token_expires_at = p.token_expires_at;
      }
      const { error } = await supabase
        .from("social_accounts")
        .update(updates)
        .eq("id", p.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const id: string | undefined = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase
        .from("social_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test") {
      const id: string | undefined = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row, error: fetchError } = await supabase
        .from("social_accounts")
        .select("platform, access_token_encrypted")
        .eq("id", id)
        .single();
      if (fetchError || !row) {
        return new Response(
          JSON.stringify({ error: fetchError?.message ?? "Account not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (!row.access_token_encrypted) {
        await supabase
          .from("social_accounts")
          .update({
            last_validated_at: new Date().toISOString(),
            last_validation_error: "No access token stored",
          })
          .eq("id", id);
        return new Response(
          JSON.stringify({ ok: false, error: "No access token stored" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      try {
        const plaintext = await decryptToken(
          row.access_token_encrypted as string,
        );
        await verifyToken(row.platform as Platform, plaintext);
        await supabase
          .from("social_accounts")
          .update({
            last_validated_at: new Date().toISOString(),
            last_validation_error: null,
          })
          .eq("id", id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (verr) {
        const message =
          verr instanceof Error ? verr.message : "Verification failed";
        await supabase
          .from("social_accounts")
          .update({
            last_validated_at: new Date().toISOString(),
            last_validation_error: message,
          })
          .eq("id", id);
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("manage-social-account error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

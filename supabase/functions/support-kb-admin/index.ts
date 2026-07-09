/**
 * SECURITY: verify_jwt = false
 * Reason: admin console CRUD; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (admin-only KB writes; no user data).
 *
 * support-kb-admin (AOS-CS-003) — admin CRUD for KB articles. Writes go through
 * the service role (support_kb has no client write policy); edits set
 * needs_embedding via the DB trigger, and this handler kicks off an inline
 * re-embed so a saved article is immediately retrievable.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { embedText, toVectorLiteral } from "../_shared/embed.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function embedArticle(supabase: Client, id: string, title: string, content: string): Promise<void> {
  try {
    const { embedding } = await embedText(`${title}\n\n${content}`);
    await supabase.from("support_kb").update({ embedding: toVectorLiteral(embedding), needs_embedding: false }).eq("id", id);
  } catch {
    // Leave needs_embedding = true; the scheduled support-kb-embed retries.
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "list");

  try {
    if (action === "list") {
      const { data, error } = await supabase
        .from("support_kb")
        .select("id, title, content, source, category, is_active, needs_embedding, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return json({ ok: true, articles: data ?? [] }, 200, corsHeaders);
    }

    if (action === "upsert") {
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title || !content) return json({ error: "title and content are required" }, 400, corsHeaders);
      const row = {
        title,
        content,
        source: body.source ? String(body.source) : null,
        category: body.category ? String(body.category) : null,
        is_active: body.is_active === false ? false : true,
        needs_embedding: true,
      };
      let id = body.id ? String(body.id) : null;
      if (id) {
        const { error } = await supabase.from("support_kb").update(row).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("support_kb").insert(row).select("id").single();
        if (error) throw new Error(error.message);
        id = data.id;
      }
      // Re-embed inline so the article is immediately retrievable.
      await embedArticle(supabase, id!, title, content);
      return json({ ok: true, id }, 200, corsHeaders);
    }

    if (action === "delete") {
      const id = body.id ? String(body.id) : null;
      if (!id) return json({ error: "id required" }, 400, corsHeaders);
      const { error } = await supabase.from("support_kb").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return json({ ok: true }, 200, corsHeaders);
    }

    return json({ error: `unknown action: ${action}` }, 400, corsHeaders);
  } catch (err) {
    return json({ error: (err as Error)?.message ?? "kb admin error" }, 500, corsHeaders);
  }
});

/**
 * kbRetrieve — grounded retrieval over the support KB (AOS-CS-003).
 *
 * retrieveKb(supabase, query) embeds the query (OpenAI) and calls the
 * match_support_kb RPC, returning the top passages WITH their sources so the
 * first-responder (AOS-CS-002) can cite them and humans can verify. Returns the
 * embedding cost so the caller can attribute it to the agent budget.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embedText, toVectorLiteral } from "./embed.ts";

export interface KbPassage {
  id: string;
  title: string;
  content: string;
  source: string | null;
  category: string | null;
  similarity: number;
}

export interface KbRetrieval {
  passages: KbPassage[];
  costUsd: number;
  tokens: number;
}

export async function retrieveKb(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  query: string,
  opts?: { matchCount?: number; threshold?: number },
): Promise<KbRetrieval> {
  const { embedding, costUsd, tokens } = await embedText(query);
  const { data, error } = await supabase.rpc("match_support_kb", {
    query_embedding: toVectorLiteral(embedding),
    match_count: opts?.matchCount ?? 5,
    similarity_threshold: opts?.threshold ?? 0.5,
  });
  if (error) throw new Error(`match_support_kb failed: ${error.message}`);
  return { passages: (data ?? []) as KbPassage[], costUsd, tokens };
}

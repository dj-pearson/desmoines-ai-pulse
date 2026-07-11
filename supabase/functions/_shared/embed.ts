/**
 * embed — OpenAI text-embedding helper for the support KB (AOS-CS-003).
 * text-embedding-3-small → 1536 dims. Returns the vector + an approximate cost
 * so callers can attribute it to the agent budget. Throws on API error (callers
 * decide how to surface it).
 */
import { fetchWithTimeout } from "./fetchWithTimeout.ts";

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
// text-embedding-3-small is ~$0.02 / 1M tokens.
const USD_PER_TOKEN = 0.02 / 1_000_000;

export interface EmbedResult {
  embedding: number[];
  tokens: number;
  costUsd: number;
}

export async function embedText(text: string): Promise<EmbedResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const input = text.slice(0, 8000); // keep well within the model's token limit
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const embedding = json?.data?.[0]?.embedding as number[] | undefined;
  if (!embedding || embedding.length !== DIMS) throw new Error("embedding: unexpected response shape");
  const tokens = Number(json?.usage?.total_tokens) || Math.ceil(input.length / 4);
  return { embedding, tokens, costUsd: tokens * USD_PER_TOKEN };
}

/** pgvector accepts a bracketed string literal for a vector column. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

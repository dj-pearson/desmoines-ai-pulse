/**
 * auto-article-pipeline (WEB-AUTO-007)
 *
 * Daily self-running local-SEO article pipeline:
 *   1. select a fresh topic (Claude), deduped against recent article titles,
 *   2. generate a full local-SEO draft (Claude, same local-context strategy as
 *      the manual generate-article function — left untouched for human flows),
 *   3. score the draft (word count >= 400, Des Moines relevance, readability,
 *      similarity-to-existing < threshold, Claude safety check) -> 0-100 + reasons,
 *   4. decide:
 *        score >= 80  -> published (status=published, published_at, slug, SEO),
 *        score 50-79  -> draft in the review queue (review_status=pending_review),
 *        score < 50 or unsafe -> discarded (attempt logged, no row written).
 *
 * Guardrails:
 *   - Cap of 1 auto-PUBLISHED article/day (extra high-scorers fall back to draft).
 *   - Admin pause via a single system_settings row (setting_type='article_pipeline',
 *     settings.paused) — no code change required.
 *   - Auth: requireAdminOrApiKey (cron service-role bearer + admin re-run JWT pass).
 *   - Runs + score distribution recorded through the WEB-AUTO-001 jobRunner.
 *
 * Published articles automatically enter the sitemap (generate-sitemap queries
 * status='published') and the published-article pool the newsletter draws from.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';
import {
  getAIConfig,
  buildClaudeRequest,
  buildLightweightClaudeRequest,
  getClaudeHeaders,
} from '../_shared/aiConfig.ts';

const DAILY_AUTOPUBLISH_CAP = 1;
const PUBLISH_THRESHOLD = 80;
const DRAFT_THRESHOLD = 50;
const MIN_WORD_COUNT = 400;
const SIMILARITY_REJECT = 0.7; // Jaccard over title tokens
const SIMILARITY_WARN = 0.5;
const RECENT_TITLE_LIMIT = 100;

// Condensed local-SEO context shared by topic + draft prompts. Mirrors the
// strategy used by generate-article without coupling to that function.
const LOCAL_CONTEXT = `Des Moines, Iowa (Central Iowa). Greater metro: West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Altoona, Pleasant Hill. Neighborhoods: East Village, Court Avenue, Ingersoll, Beaverdale, Highland Park, Drake, Sherman Hill, Valley Junction. Landmarks: Iowa State Capitol, Principal Park, Pappajohn Sculpture Park, Des Moines Art Center, Science Center of Iowa. Local culture: Iowa State Fair (August), RAGBRAI (July), Downtown Farmers Market (May-Oct), craft beer scene, insurance & agriculture industry hub.`;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with',
  'your', 'you', 'guide', 'best', 'top', 'des', 'moines', 'iowa', 'how', 'what',
  'where', 'when', 'is', 'are', 'this', 'that', 'from', 'by', 'near', 'me',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in AI response');
  return JSON.parse(match[0]);
}

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const claudeApiKey = Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
  const supabase = createClient(url, serviceKey);

  const job = await runJob('auto-article-pipeline', async (ctx) => {
    if (!claudeApiKey) throw new Error('CLAUDE_API key is required');

    // ---- 0. Pause flag (admin-toggleable, no code change) ----
    const { data: setting } = await supabase
      .from('system_settings')
      .select('settings')
      .eq('setting_type', 'article_pipeline')
      .maybeSingle();
    const paused = !!(setting?.settings as { paused?: boolean } | null)?.paused;
    if (paused) {
      ctx.meta({ skipped: 'paused', decision: 'skipped' });
      return { decision: 'skipped', reason: 'pipeline paused via system_settings' };
    }

    // ---- 1. How many auto-published already today? (daily cap) ----
    const { count: publishedToday } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('auto_generated', true)
      .eq('status', 'published')
      .gte('published_at', startOfTodayUtc());
    const publishBlocked = (publishedToday ?? 0) >= DAILY_AUTOPUBLISH_CAP;

    // ---- 2. Recent titles for dedupe + similarity ----
    const { data: recentArticles } = await supabase
      .from('articles')
      .select('title, slug')
      .order('created_at', { ascending: false })
      .limit(RECENT_TITLE_LIMIT);
    const recentTitles = (recentArticles ?? []).map((a) => String(a.title));
    const recentSlugs = new Set((recentArticles ?? []).map((a) => String(a.slug)));
    const recentTokenSets = recentTitles.map((t) => tokenize(t));

    const config = await getAIConfig(url, serviceKey);
    const headers = await getClaudeHeaders(claudeApiKey, url, serviceKey);
    const callClaude = async (body: unknown): Promise<string> => {
      const res = await fetch(config.api_endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Claude API error: ${res.status} - ${errText.slice(0, 300)}`);
      }
      const json = await res.json();
      return json.content?.[0]?.text ?? '';
    };

    // ---- 3. Topic selection ----
    const month = new Date().toLocaleString('en-US', { month: 'long', timeZone: 'America/Chicago' });
    const topicPrompt = `You are a content strategist for DiscoverDesMoines.com. Local context: ${LOCAL_CONTEXT}
Current month: ${month}.
Recently published titles to AVOID duplicating:
${recentTitles.slice(0, 30).join('\n') || '(none yet)'}

Suggest 6 fresh, specific, locally-relevant article topics that fill content gaps and have strong local SEO potential. Avoid anything overlapping the titles above.
Return ONLY JSON:
{"suggestions":[{"title":"...","category":"Events|Restaurants|Attractions|Culture|Business|Tourism|Entertainment|General","seo_potential":"high|medium|low","estimated_keywords":["..."],"unique_angle":"...","description":"..."}]}`;

    const topicText = await callClaude(
      await buildClaudeRequest([{ role: 'user', content: topicPrompt }], {
        supabaseUrl: url,
        supabaseKey: serviceKey,
        useCreativeTemp: true,
      }),
    );
    let suggestions: Array<Record<string, unknown>> = [];
    try {
      suggestions = (extractJson(topicText).suggestions || []) as Array<Record<string, unknown>>;
    } catch (e) {
      throw new Error(`Failed to parse topic suggestions: ${(e as Error).message}`);
    }

    const seoRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const candidates = suggestions
      .map((s) => {
        const title = String(s.title || '').trim();
        const tokens = tokenize(title);
        const maxSim = recentTokenSets.reduce((m, rt) => Math.max(m, jaccard(tokens, rt)), 0);
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
        return { s, title, maxSim, slug };
      })
      .filter((c) => c.title && c.maxSim < SIMILARITY_REJECT && !recentSlugs.has(c.slug))
      .sort((a, b) => (seoRank[String(b.s.seo_potential)] || 0) - (seoRank[String(a.s.seo_potential)] || 0));

    if (candidates.length === 0) {
      ctx.meta({ decision: 'skipped', reason: 'no fresh topic', suggestionsConsidered: suggestions.length });
      return { decision: 'skipped', reason: 'all suggested topics duplicated existing content' };
    }
    const chosen = candidates[0];
    const topic = chosen.title;
    const category = String(chosen.s.category || 'General');
    const keywords = Array.isArray(chosen.s.estimated_keywords) ? chosen.s.estimated_keywords : [];

    // ---- 4. Draft generation ----
    const draftPrompt = `You are an expert local SEO writer for DiscoverDesMoines.com. Local context: ${LOCAL_CONTEXT}
Write a complete, publication-ready article.
Topic: ${topic}
Category: ${category}
Target keywords: ${keywords.join(', ') || '(choose relevant ones)'}
Requirements: 700-1200 words; reference Des Moines/Iowa naturally (3+ times) with specific neighborhoods/landmarks; clean MARKDOWN body (## H2, ### H3, - lists, **bold**); NO H1, NO HTML, NO placeholders; engaging, accurate, actionable.
Return ONLY JSON:
{"title":"...","content":"FULL markdown body","excerpt":"150-160 char hook","seo_title":"<60 chars","seo_description":"150-160 chars","seo_keywords":["..."],"category":"${category}","tags":["..."]}`;

    const draftText = await callClaude(
      await buildClaudeRequest([{ role: 'user', content: draftPrompt }], {
        supabaseUrl: url,
        supabaseKey: serviceKey,
        useLargeTokens: true,
      }),
    );
    let draft: Record<string, unknown>;
    try {
      draft = extractJson(draftText);
    } catch (e) {
      throw new Error(`Failed to parse generated draft: ${(e as Error).message}`);
    }
    const content = String(draft.content || '');
    const title = String(draft.title || topic).trim();

    // ---- 5. Score the draft ----
    const reasons: string[] = [];
    let score = 100;

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORD_COUNT) {
      score -= 60;
      reasons.push(`Too short (${wordCount} words, need >=${MIN_WORD_COUNT})`);
    } else if (wordCount < 600) {
      score -= 10;
      reasons.push(`Somewhat short (${wordCount} words)`);
    }

    const localMentions = (content.match(/des moines|iowa/gi) || []).length;
    if (localMentions === 0) {
      score -= 40;
      reasons.push('No Des Moines/Iowa references');
    } else if (localMentions < 3) {
      score -= 15;
      reasons.push(`Weak local relevance (${localMentions} mentions)`);
    }

    const titleTokens = tokenize(title);
    const maxSim = recentTokenSets.reduce((m, rt) => Math.max(m, jaccard(titleTokens, rt)), 0);
    if (maxSim >= SIMILARITY_REJECT) {
      score -= 50;
      reasons.push(`Too similar to existing article (${Math.round(maxSim * 100)}%)`);
    } else if (maxSim >= SIMILARITY_WARN) {
      score -= 20;
      reasons.push(`Moderately similar to existing content (${Math.round(maxSim * 100)}%)`);
    }

    // Readability: average words per sentence.
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLen = sentences.length ? wordCount / sentences.length : wordCount;
    if (avgSentenceLen > 30) {
      score -= 10;
      reasons.push(`Long sentences hurt readability (~${Math.round(avgSentenceLen)} words/sentence)`);
    }

    if (!draft.seo_title || !draft.seo_description) {
      score -= 10;
      reasons.push('Missing SEO title/description');
    }

    // Safety check (lightweight Claude moderation).
    let safe = true;
    try {
      const safetyText = await callClaude(
        await buildLightweightClaudeRequest(
          [{
            role: 'user',
            content: `Is the following local-news article body safe, on-topic, and free of hate/violence/sexual/spam/misinformation content for a general-audience city guide? Reply ONLY JSON {"safe":true|false,"reason":"..."}.\n\n${content.slice(0, 6000)}`,
          }],
          { supabaseUrl: url, supabaseKey: serviceKey },
        ),
      );
      const verdict = extractJson(safetyText);
      safe = verdict.safe !== false;
      if (!safe) reasons.push(`Safety check flagged: ${verdict.reason || 'unsafe content'}`);
    } catch (e) {
      // Fail safe-pending: do not auto-publish content we could not screen.
      safe = false;
      reasons.push(`Safety check could not complete (${(e as Error).message.slice(0, 80)}) — held for review`);
    }

    score = Math.max(0, Math.min(100, score));

    // ---- 6. Decision ----
    let decision: 'published' | 'draft' | 'discarded';
    if (!safe || score < DRAFT_THRESHOLD) {
      decision = 'discarded';
    } else if (score >= PUBLISH_THRESHOLD && !publishBlocked) {
      decision = 'published';
    } else {
      decision = 'draft';
      if (score >= PUBLISH_THRESHOLD && publishBlocked) {
        reasons.push('Daily auto-publish cap reached — queued as draft');
      }
    }

    const scoreMeta = {
      topic,
      category,
      score,
      wordCount,
      localMentions,
      maxSimilarity: Math.round(maxSim * 100) / 100,
      safe,
      decision,
      publishBlocked,
      reasons,
    };

    if (decision === 'discarded') {
      ctx.meta(scoreMeta);
      return scoreMeta; // attempt logged; no row written
    }

    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      title,
      slug: '', // auto_generate_article_slug_trigger fills this when slug is empty
      content,
      excerpt: draft.excerpt ?? null,
      author_id: null, // system-authored
      category,
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      seo_title: draft.seo_title ?? null,
      seo_description: draft.seo_description ?? null,
      seo_keywords: Array.isArray(draft.seo_keywords) ? draft.seo_keywords : keywords,
      auto_generated: true,
      quality_score: score,
      generation_reasons: reasons,
      generation_topic: topic,
      status: decision === 'published' ? 'published' : 'draft',
      published_at: decision === 'published' ? nowIso : null,
      review_status: decision === 'published' ? 'approved' : 'pending_review',
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('articles')
      .insert(row)
      .select('id, slug, status')
      .single();
    if (insertErr) throw insertErr;

    ctx.processed(1);
    ctx.meta({ ...scoreMeta, articleId: inserted?.id, slug: inserted?.slug });
    return { ...scoreMeta, articleId: inserted?.id, slug: inserted?.slug };
  });

  return new Response(JSON.stringify(job), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

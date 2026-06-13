/**
 * ai-article-pipeline (WEB-AUTO-007)
 *
 * Daily self-running local-SEO article pipeline:
 *   1. pick the top topic from suggest-article-topics (deduped vs recent articles),
 *   2. call generate-article with that topic (creates a draft),
 *   3. score the draft (word count, Des Moines relevance, readability,
 *      similarity-to-existing, safety check),
 *   4. route by score:
 *        >= 80 + safe  -> publish (status=published, published_at, is_auto_published),
 *        50-79         -> keep as draft in the review queue (review_status=pending_review),
 *        < 50 / unsafe -> discard (delete the draft) with the attempt logged.
 *
 * Cap: 1 auto-published article/day. Pause: feature_flags.ai_article_pipeline_enabled.
 * Runs + score distribution recorded through the WEB-AUTO-001 jobRunner.
 *
 * Human-authored article flows (AIArticleGenerator / generate-article via the
 * admin UI) are untouched.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { getAIConfig, getClaudeHeaders } from '../_shared/aiConfig.ts';

const PAUSE_FLAG = 'ai_article_pipeline_enabled';
const DAILY_CAP = 1;
const PUBLISH_THRESHOLD = 80;
const DRAFT_THRESHOLD = 50;
const SIMILARITY_DISCARD = 0.6; // title near-identical to an existing article
const MIN_WORDS = 400;

interface Suggestion {
  title: string;
  description?: string;
  category?: string;
  estimated_keywords?: string[];
  seo_potential?: string;
}

interface GeneratedArticle {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  seo_title?: string;
  seo_description?: string;
}

// --- text helpers -----------------------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function wordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizeTitle(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const supabase = createClient(url, serviceKey);

  const job = await runJob('ai-article-pipeline', async (ctx) => {
    // --- pause flag ---------------------------------------------------------
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', PAUSE_FLAG)
      .maybeSingle();
    if (flag && flag.enabled === false) {
      ctx.meta({ paused: true });
      return { paused: true, decision: 'paused' };
    }

    // --- daily cap (auto-published only) ------------------------------------
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: publishedToday } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('is_auto_published', true)
      .gte('published_at', startOfDay.toISOString());
    if ((publishedToday ?? 0) >= DAILY_CAP) {
      ctx.meta({ capped: true, publishedToday });
      return { capped: true, decision: 'capped', publishedToday };
    }

    // --- recent articles (for topic + content dedup) ------------------------
    const { data: recent } = await supabase
      .from('articles')
      .select('title, content')
      .order('created_at', { ascending: false })
      .limit(80);
    const recentTitles = new Set((recent ?? []).map((a) => normalizeTitle(a.title as string)));
    const recentTokenSets = (recent ?? []).map((a) => tokenize(a.title as string));

    // --- 1) topic selection -------------------------------------------------
    const topicRes = await fetch(`${url}/functions/v1/suggest-article-topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ suggestionCount: 8, excludeExistingTopics: true }),
    });
    if (!topicRes.ok) throw new Error(`suggest-article-topics failed: ${topicRes.status}`);
    const topicJson = await topicRes.json();
    const suggestions: Suggestion[] = topicJson?.data?.suggestions ?? [];
    if (suggestions.length === 0) throw new Error('no topic suggestions returned');

    // Rank by SEO potential, then pick the first not duplicating a recent article.
    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const ordered = [...suggestions].sort(
      (a, b) => (rank[b.seo_potential ?? 'medium'] ?? 2) - (rank[a.seo_potential ?? 'medium'] ?? 2),
    );
    const chosen = ordered.find((s) => {
      const norm = normalizeTitle(s.title);
      if (recentTitles.has(norm)) return false;
      const tk = tokenize(s.title);
      return !recentTokenSets.some((rt) => jaccard(tk, rt) >= SIMILARITY_DISCARD);
    });
    if (!chosen) {
      ctx.meta({ decision: 'no_fresh_topic' });
      return { decision: 'no_fresh_topic', candidates: suggestions.length };
    }

    // --- 2) draft generation ------------------------------------------------
    const genRes = await fetch(`${url}/functions/v1/generate-article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        topic: chosen.title,
        category: chosen.category || 'General',
        targetKeywords: chosen.estimated_keywords || [],
        includeLocalSEO: true,
      }),
    });
    if (!genRes.ok) throw new Error(`generate-article failed: ${genRes.status}`);
    const genJson = await genRes.json();
    const article: GeneratedArticle | undefined = genJson?.article;
    if (!article?.id) throw new Error('generate-article did not return an article');

    // --- 3) scoring ---------------------------------------------------------
    const reasons: string[] = [];
    let score = 0;
    const words = wordCount(article.content);

    // word count (>= 400 required)
    if (words >= MIN_WORDS) {
      score += 25;
    } else {
      reasons.push(`too short (${words} words, need ${MIN_WORDS})`);
    }

    // Des Moines / Iowa local relevance
    const lc = (article.content || '').toLowerCase();
    const dmHits = (lc.match(/des moines/g) || []).length;
    const iaHits = (lc.match(/\biowa\b/g) || []).length;
    if (dmHits >= 2) score += 20;
    else if (dmHits + iaHits >= 1) score += 10;
    else reasons.push('weak local (Des Moines/Iowa) relevance');

    // readability (avg words/sentence in a comfortable band)
    const sentences = (article.content || '').split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgLen = sentences.length ? words / sentences.length : 0;
    if (avgLen >= 10 && avgLen <= 24) score += 20;
    else { score += 8; reasons.push(`readability off (avg ${avgLen.toFixed(0)} words/sentence)`); }

    // uniqueness vs existing articles
    const draftTokens = tokenize(`${article.title} ${article.content}`);
    let maxSim = 0;
    for (const a of recent ?? []) {
      maxSim = Math.max(maxSim, jaccard(draftTokens, tokenize(`${a.title} ${a.content}`)));
    }
    if (maxSim < 0.3) score += 25;
    else if (maxSim < 0.5) score += 12;
    else reasons.push(`too similar to existing content (${(maxSim * 100).toFixed(0)}%)`);

    // SEO fields present
    if (article.seo_title && article.seo_description && article.excerpt) score += 10;
    else reasons.push('missing SEO fields');

    // safety check (Claude). On error => not unsafe, but cap below auto-publish.
    let safe = true;
    let safetyChecked = false;
    try {
      const aiCfg = await getAIConfig(url, serviceKey);
      const claudeKey = Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
      if (claudeKey) {
        const headers = await getClaudeHeaders(claudeKey, url, serviceKey);
        const safetyRes = await fetch(aiCfg.api_endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: aiCfg.default_model,
            max_tokens: 20,
            messages: [{
              role: 'user',
              content:
                `You are a content-safety classifier for a family-friendly local city guide. ` +
                `Reply with exactly one word: SAFE or UNSAFE. ` +
                `Mark UNSAFE only for hate, explicit sexual content, graphic violence, harassment, or dangerous instructions.\n\n` +
                `TITLE: ${article.title}\n\nARTICLE:\n${(article.content || '').slice(0, 6000)}`,
            }],
          }),
        });
        if (safetyRes.ok) {
          const sj = await safetyRes.json();
          const verdict = (sj?.content?.[0]?.text || '').toUpperCase();
          safetyChecked = true;
          if (verdict.includes('UNSAFE')) { safe = false; reasons.push('failed content-safety check'); }
        }
      }
    } catch (e) {
      console.error('[ai-article-pipeline] safety check errored:', e);
    }

    score = Math.max(0, Math.min(100, score));

    // --- 4) route -----------------------------------------------------------
    const hardFail = words < MIN_WORDS || maxSim >= SIMILARITY_DISCARD || !safe;
    let decision: 'published' | 'draft' | 'discarded';

    if (hardFail || score < DRAFT_THRESHOLD) {
      decision = 'discarded';
      await supabase.from('articles').delete().eq('id', article.id);
      ctx.failed(1);
    } else if (score >= PUBLISH_THRESHOLD && safe && (safetyChecked || dmHits >= 2)) {
      decision = 'published';
      await supabase
        .from('articles')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          review_status: 'approved',
          is_auto_published: true,
          quality_score: score,
          pipeline_reasons: reasons.length ? reasons : null,
        })
        .eq('id', article.id);
      ctx.processed(1);
    } else {
      decision = 'draft';
      await supabase
        .from('articles')
        .update({
          status: 'draft',
          review_status: 'pending_review',
          is_auto_published: false,
          quality_score: score,
          pipeline_reasons: reasons.length ? reasons : null,
        })
        .eq('id', article.id);
      ctx.processed(1);
    }

    ctx.meta({
      decision,
      topic: chosen.title,
      score,
      words,
      maxSimilarity: Number(maxSim.toFixed(3)),
      safe,
      safetyChecked,
      reasons,
    });

    return { decision, topic: chosen.title, score, words, reasons };
  });

  return new Response(
    JSON.stringify({ success: job.ok, ...job.result }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

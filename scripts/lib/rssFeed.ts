/**
 * The RSS 2.0 document behind /rss.xml (SEO-031). Pure, so the offline suite
 * can pin it without a database.
 *
 * public/rss.xml used to be a file someone exported from the admin SEO tools
 * on 2025-07-30 and committed. Nothing rebuilt it, nothing linked to it, and
 * its dates were ISO 8601, which RSS 2.0 does not accept (it wants RFC 822).
 * scripts/generate-rss.ts now rebuilds it on every build from published
 * articles and upcoming events.
 */
import { createEventSlug } from './sitemapSlugs';

export interface RssArticle {
  slug: string | null;
  id: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string | null;
}

export interface RssEvent {
  id: string;
  title: string;
  date: string | null;
  event_start_utc: string | null;
  venue: string | null;
  category: string | null;
  seo_description: string | null;
  geo_summary: string | null;
  original_description: string | null;
  created_at: string | null;
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  category: string;
  pubDate: string;
  /** Sort key, newest first. */
  sortAt: number;
}

export interface RssChannel {
  baseUrl: string;
  title: string;
  description: string;
  buildDate: Date;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Characters XML 1.0 forbids outright; a feed reader rejects the whole
    // document over one of them.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** RFC 822 as RSS 2.0 requires it: "Wed, 01 Oct 2026 04:04:24 GMT". */
export function rfc822(d: Date): string {
  return d.toUTCString();
}

function parse(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Plain text from a field that may carry the enhancer's markdown. */
function plain(s: string): string {
  return s.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim();
}

function clip(s: string, max = 300): string {
  return s.length <= max ? s : `${s.slice(0, max - 3).replace(/\s+\S*$/, '')}...`;
}

const CENTRAL_WHEN = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function articleItem(a: RssArticle, baseUrl: string): RssItem | null {
  const published = parse(a.published_at) ?? parse(a.created_at);
  if (!published || !a.title?.trim()) return null;
  return {
    title: a.title.trim(),
    link: `${baseUrl}/articles/${a.slug || a.id}`,
    description: clip(plain(a.excerpt ?? '')),
    category: a.category?.trim() || 'Articles',
    pubDate: rfc822(published),
    sortAt: published.getTime(),
  };
}

export function eventItem(e: RssEvent, baseUrl: string): RssItem | null {
  const starts = parse(e.event_start_utc) ?? parse(e.date);
  // pubDate is when the listing appeared, not when the event happens: a feed
  // reader sorts and dedupes on it, and a future pubDate reads as an error.
  const listed = parse(e.created_at) ?? starts;
  if (!starts || !listed || !e.title?.trim()) return null;
  const when = `${CENTRAL_WHEN.format(starts)}${e.venue?.trim() ? ` at ${e.venue.trim()}` : ''}.`;
  const blurb = plain(e.seo_description || e.geo_summary || e.original_description || '');
  return {
    title: e.title.trim(),
    link: `${baseUrl}/events/${createEventSlug(e.title, e)}`,
    description: clip(blurb ? `${when} ${blurb}` : when),
    category: e.category?.trim() || 'Events',
    pubDate: rfc822(listed),
    sortAt: listed.getTime(),
  };
}

export function renderRss(channel: RssChannel, items: RssItem[]): string {
  const { baseUrl } = channel;
  const sorted = [...items].sort((a, b) => b.sortAt - a.sortAt);
  const body = sorted
    .map(
      (i) => `    <item>
      <title>${xmlEscape(i.title)}</title>
      <link>${xmlEscape(i.link)}</link>
      <guid isPermaLink="true">${xmlEscape(i.link)}</guid>
      <description>${xmlEscape(i.description)}</description>
      <category>${xmlEscape(i.category)}</category>
      <pubDate>${i.pubDate}</pubDate>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <link>${xmlEscape(baseUrl)}/</link>
    <description>${xmlEscape(channel.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(channel.buildDate)}</lastBuildDate>
    <atom:link href="${xmlEscape(baseUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`;
}

import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";

/**
 * "About This Hotel" on /stay/:slug, labelled AI-assisted (WEB-SEO-061).
 *
 * Where the text comes from: every hotel's description, short_description,
 * geo_summary and geo_key_facts were written by the agent batch in
 * scripts/content-fill/hotels-content.json (124 rows, all four fields on every
 * row), paraphrased from AAA and brand pages listed in each row's `sources`.
 * No other writer fills them: search-new-hotels inserts no description and
 * enrich-hotels-places says it never touches one. An admin can edit them in
 * HotelEditDialog, but nothing records who wrote the current text, so the label
 * is unconditional. Calling an editor's paragraph AI-assisted is the smaller
 * error than leaving a model's paragraph unlabelled.
 *
 * Structured data, decided: HotelSchema still publishes `description`. That
 * matches the event page, whose Event node carries the AI-enhanced description
 * while the visible block is badged. What stays out of JSON-LD is model text
 * stated as an answer (FAQPage, see AiAnswersList); geo_summary and
 * geo_key_facts are not in any schema node.
 */

export const HOTEL_AI_TOOLTIP =
  "Written with AI from the hotel's own site and travel listings. Confirm rates, fees and policies with the hotel.";

interface HotelAboutProps {
  description?: string | null;
  geoSummary?: string | null;
  keyFacts?: string[] | null;
}

export function HotelAbout({ description, geoSummary, keyFacts }: HotelAboutProps) {
  const text = description?.trim() || null;
  const summary = geoSummary?.trim() || null;
  const facts = (keyFacts ?? []).map((f) => (typeof f === "string" ? f.trim() : "")).filter(Boolean);
  if (!text && !summary && facts.length === 0) return null;

  return (
    <section aria-labelledby="hotel-about">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="hotel-about" className="text-xl font-semibold">
          About This Hotel
        </h2>
        <AIDisclosureBadge label="AI-assisted" tooltip={HOTEL_AI_TOOLTIP} />
      </div>
      {text && (
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line max-w-prose">{text}</p>
      )}
      {summary && summary !== text && (
        <p className="mt-3 text-muted-foreground leading-relaxed max-w-prose">{summary}</p>
      )}
      {facts.length > 0 && (
        <ul className="mt-4 list-disc pl-5 space-y-1 text-muted-foreground max-w-prose">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

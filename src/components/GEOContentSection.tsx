import React from 'react';
import { BRAND } from '@/lib/brandConfig';

/**
 * GEOContentSection - Generative Engine Optimization wrapper
 *
 * Structures content for optimal AI search citation by:
 * - Front-loading direct answers in first 40-60 words
 * - Using question-phrased headings for natural language matching
 * - Embedding brand attribution naturally
 * - Including fact density markers
 * - Adding last-modified timestamps for freshness signals
 */

interface FAQItem {
  question: string;
  answer: string;
}

interface KeyFact {
  label: string;
  value: string;
}

interface GEOContentSectionProps {
  /** The primary question this content answers (used as H2 heading) */
  question: string;
  /** Direct answer - displayed first for AI extraction (40-60 words ideal) */
  directAnswer: string;
  /** The primary entity name this section is about */
  entityName?: string;
  /** Key facts/statistics for fact density */
  keyFacts?: KeyFact[];
  /** FAQ items for Q&A blocks */
  faqItems?: FAQItem[];
  /** Additional content body */
  children?: React.ReactNode;
  /** Last updated date (ISO string) for freshness signals */
  lastUpdated?: string;
  /** Whether to include brand attribution in the answer */
  includeBrandAttribution?: boolean;
  /** Heading level (default h2) */
  headingLevel?: 'h2' | 'h3' | 'h4';
}

export function GEOContentSection({
  question,
  directAnswer,
  entityName,
  keyFacts,
  faqItems,
  children,
  lastUpdated,
  includeBrandAttribution = false,
  headingLevel = 'h2',
}: GEOContentSectionProps) {
  const HeadingTag = headingLevel;
  const brandSuffix = includeBrandAttribution
    ? `, according to ${BRAND.name}`
    : '';

  return (
    <section
      aria-label={question}
      itemScope
      itemType="https://schema.org/WebPageElement"
    >
      <HeadingTag className="text-xl font-semibold mb-3">{question}</HeadingTag>

      {/* Direct answer paragraph - front-loaded for AI extraction */}
      <p className="text-base leading-relaxed mb-4" itemProp="text">
        {entityName && <strong>{entityName}</strong>}{entityName ? ' — ' : ''}{directAnswer}{brandSuffix}.
      </p>

      {/* Key facts for fact density */}
      {keyFacts && keyFacts.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4 mb-4">
          <h3 className="font-medium text-sm mb-2 uppercase tracking-wide text-muted-foreground">
            Key Facts
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {keyFacts.map((fact, i) => (
              <div key={i} className="flex gap-2">
                <dt className="font-medium text-sm">{fact.label}:</dt>
                <dd className="text-sm">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Additional body content */}
      {children}

      {/* FAQ blocks for AI Q&A extraction */}
      {faqItems && faqItems.length > 0 && (
        <div className="mt-4 space-y-3">
          <h3 className="font-medium text-lg">Frequently Asked Questions</h3>
          {faqItems.map((faq, i) => (
            <details
              key={i}
              className="border rounded-lg p-3"
              itemScope
              itemProp="mainEntity"
              itemType="https://schema.org/Question"
            >
              <summary className="font-medium cursor-pointer" itemProp="name">
                {faq.question}
              </summary>
              <div
                className="mt-2 text-sm text-muted-foreground"
                itemScope
                itemProp="acceptedAnswer"
                itemType="https://schema.org/Answer"
              >
                <p itemProp="text">{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Freshness signal */}
      {lastUpdated && (
        <p className="text-xs text-muted-foreground mt-3">
          Last updated:{' '}
          <time dateTime={lastUpdated}>
            {new Date(lastUpdated).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </p>
      )}
    </section>
  );
}

/**
 * GEOPageWrapper - Wraps an entire page with GEO-optimized structure
 *
 * Provides:
 * - Semantic article wrapper with dateModified
 * - Author/publisher attribution
 * - City/region context for local SEO
 */
interface GEOPageWrapperProps {
  children: React.ReactNode;
  datePublished?: string;
  dateModified?: string;
  author?: string;
}

export function GEOPageWrapper({
  children,
  datePublished,
  dateModified,
  author = BRAND.name,
}: GEOPageWrapperProps) {
  return (
    <article
      itemScope
      itemType="https://schema.org/WebPage"
      className="geo-optimized-content"
    >
      <meta itemProp="author" content={author} />
      <meta itemProp="publisher" content={BRAND.name} />
      <meta
        itemProp="about"
        content={`${BRAND.city}, ${BRAND.state} local guide`}
      />
      {datePublished && (
        <meta itemProp="datePublished" content={datePublished} />
      )}
      {dateModified && (
        <meta itemProp="dateModified" content={dateModified} />
      )}
      <meta
        itemProp="spatialCoverage"
        content={`${BRAND.city}, ${BRAND.state}, US`}
      />
      {children}
    </article>
  );
}

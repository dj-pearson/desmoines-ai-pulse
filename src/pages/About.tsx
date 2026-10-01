import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { BRAND } from "@/lib/brandConfig";
import { ABOUT_PATH, organizationNode } from "@/lib/articleSchema";
import { toJsonLd } from "@/lib/jsonLd";

/**
 * /about (SEO-037): who runs the site and how listings get on it.
 *
 * Every statement here is sourced from something already in the repo, because
 * this page is what article bylines and the Organization author in
 * src/lib/articleSchema.ts point at, and an About page that overstates is worse
 * than none:
 *
 *   coverage area           Index.tsx FAQ "Which areas does Des Moines Insider cover?"
 *   daily event crawl       .github/workflows/event-crawler.yml (Catch Des Moines, 6 AM Central)
 *   submissions in 48 hours src/pages/SubmitEvent.tsx
 *   weekly / monthly review Index.tsx FAQ "How often are the listings updated?", public/llms.txt
 *   archived past events    src/pages/NotFound.tsx
 *   AI-assisted articles    ArticleDetails.tsx AIDisclosureNotice copy
 *   sponsored labels        src/lib/sponsored.ts (SPONSORED_CAP = 2), SponsoredBadge.tsx
 *   address and email       Footer.tsx, BRAND.email
 *
 * OPEN (owner): no named editor exists in the data. When the owner supplies a
 * byline name and bio, add them under "Who runs this site" and switch the
 * article author in articleSchema.ts from Organization to Person.
 */

const ABOUT_URL = `${BRAND.baseUrl}${ABOUT_PATH}`;

const aboutSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": ABOUT_URL,
  url: ABOUT_URL,
  name: `About ${BRAND.name}`,
  inLanguage: "en-US",
  mainEntity: {
    ...organizationNode(),
    areaServed: {
      "@type": "Place",
      name: "Greater Des Moines, Iowa",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: BRAND.city,
      addressRegion: BRAND.stateAbbr,
      addressCountry: BRAND.country,
    },
  },
};

export default function About() {
  return (
    <>
      <SEOHead
        title={`About ${BRAND.name} and how listings are chosen`}
        description={`Who runs ${BRAND.name}, what it covers across the Des Moines metro, and how events, restaurants and articles get on the site.`}
        canonicalUrl={ABOUT_URL}
        keywords={["about Des Moines Insider", "Des Moines events guide", "how listings are chosen"]}
      />
      <Helmet>
        <script type="application/ld+json">{toJsonLd(aboutSchema)}</script>
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="max-w-prose mx-auto">
            <Breadcrumbs
              className="mb-6"
              items={[{ label: "Home", href: "/" }, { label: "About" }]}
            />

            <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
              About {BRAND.name}
            </h1>
            <p className="text-lg text-muted-foreground mb-10">
              {BRAND.name} is a local guide to what is on in Des Moines: events,
              restaurants, attractions, playgrounds and the occasional article
              about all of them.
            </p>

            <section className="mb-10" aria-labelledby="who">
              <h2 id="who" className="text-2xl font-semibold mb-3">Who runs this site</h2>
              <p className="mb-3 leading-relaxed">
                {BRAND.name} is run from Des Moines, Iowa. Articles are published
                under the {BRAND.name} name rather than an individual byline.
              </p>
              <p className="leading-relaxed">
                You can reach the people behind it at{" "}
                <a href={`mailto:${BRAND.email}`} className="text-primary underline hover:no-underline">
                  {BRAND.email}
                </a>{" "}
                or through the <Link to="/contact" className="text-primary underline hover:no-underline">contact page</Link>.
              </p>
            </section>

            <section className="mb-10" aria-labelledby="coverage">
              <h2 id="coverage" className="text-2xl font-semibold mb-3">What we cover</h2>
              <p className="leading-relaxed">
                Des Moines proper and the surrounding metro: West Des Moines,
                Ankeny, Urbandale, Clive, Johnston, Waukee, Windsor Heights and
                Altoona. Times are shown in Central Time.
              </p>
            </section>

            <section className="mb-10" aria-labelledby="listings">
              <h2 id="listings" className="text-2xl font-semibold mb-3">How listings are chosen</h2>
              <ul className="list-disc pl-6 space-y-3 leading-relaxed">
                <li>
                  <strong>Events</strong> are collected every morning from the
                  public Catch Des Moines events calendar, so a venue does not have
                  to send us anything to be listed. Event pages link to the
                  original listing where one exists, and past events are archived
                  automatically.
                </li>
                <li>
                  <strong>Submitted events</strong> come in through the{" "}
                  <Link to="/submit-event" className="text-primary underline hover:no-underline">submission form</Link>{" "}
                  and a person reviews each one, usually within 48 hours, before
                  it appears.
                </li>
                <li>
                  <strong>Restaurants</strong>, including the hours behind
                  open-now status, are reviewed weekly. <strong>Attractions</strong>{" "}
                  are reviewed monthly.
                </li>
                <li>
                  <strong>Sponsored listings</strong> are labeled Sponsored. At
                  most two are moved to the top of a list; everything else keeps
                  its normal order. Affiliate links are covered in the{" "}
                  <Link to="/affiliate-disclosure" className="text-primary underline hover:no-underline">affiliate disclosure</Link>.
                </li>
              </ul>
            </section>

            <section className="mb-10" aria-labelledby="articles">
              <h2 id="articles" className="text-2xl font-semibold mb-3">How articles are written</h2>
              <p className="leading-relaxed">
                Some articles are drafted with the help of an AI model and reviewed
                by a person before they are published. Those carry an
                &ldquo;AI-assisted&rdquo; label at the top. Every article shows the
                date it was published and, when it has been revised since, the
                date it was updated.
              </p>
            </section>

            <section aria-labelledby="corrections">
              <h2 id="corrections" className="text-2xl font-semibold mb-3">Corrections</h2>
              <p className="leading-relaxed">
                If a time, price or address is wrong, email{" "}
                <a href={`mailto:${BRAND.email}`} className="text-primary underline hover:no-underline">
                  {BRAND.email}
                </a>{" "}
                with the page link.
              </p>
            </section>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}

import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AffiliateDisclosure() {
  useDocumentTitle("Affiliate Disclosure");

  return (
    <>
      <Helmet>
        <title>Affiliate Disclosure | Des Moines Insider</title>
        <meta
          name="description"
          content="Des Moines Insider affiliate disclosure. Learn how we earn commissions through hotel booking links and other affiliate partnerships."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Affiliate Disclosure</h1>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> February 2026
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                How We Earn Money
              </h2>
              <p>
                Des Moines Insider is a free resource for discovering events, restaurants,
                hotels, and attractions in the Des Moines area. To keep this site running
                and free for our users, we participate in affiliate programs and may earn
                commissions when you book hotels or make purchases through links on our site.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                What This Means for You
              </h2>
              <p>
                Some of the links on Des Moines Insider are affiliate links. This means that
                if you click on a link and make a purchase or booking, we may receive a small
                commission at no additional cost to you. The price you pay is exactly the same
                whether you use our affiliate link or go directly to the vendor's website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                Our Affiliate Partners
              </h2>
              <p>We may earn commissions from the following types of partnerships:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>
                  <strong className="text-foreground">Hotel booking platforms</strong> such as
                  Booking.com, Hotels.com, and TripAdvisor when you book accommodations
                  through our hotel pages
                </li>
                <li>
                  <strong className="text-foreground">Direct hotel partnerships</strong> with
                  individual hotels in the Des Moines area
                </li>
                <li>
                  <strong className="text-foreground">Event ticket platforms</strong> when
                  you purchase tickets through our event links
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                How We Choose What to Recommend
              </h2>
              <p>
                Our editorial content is not influenced by our affiliate relationships.
                We recommend hotels, events, and venues based on their quality, location,
                and relevance to Des Moines visitors and residents. We include both
                affiliate and non-affiliate listings on our site, and the presence of an
                affiliate relationship does not affect a listing's placement, rating, or
                how it is described.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                Identifying Affiliate Links
              </h2>
              <p>
                On our hotel pages and event pages, "Book Now" buttons and links that
                direct you to external booking platforms may be affiliate links. These
                links are marked with <code>rel="sponsored"</code> in the HTML for
                transparency. You will also see disclosure notices on pages that contain
                affiliate links.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                FTC Compliance
              </h2>
              <p>
                This disclosure is provided in accordance with the Federal Trade
                Commission's guidelines on endorsements and testimonials (16 CFR Part 255).
                We are committed to honest and transparent communication with our users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                Questions?
              </h2>
              <p>
                If you have any questions about our affiliate relationships, please{" "}
                <Link to="/contact" className="text-primary hover:underline">
                  contact us
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

/**
 * The hotel programmes generate-hotel-affiliate-urls actually wraps
 * (BRAND_CONFIGS in supabase/functions/generate-hotel-affiliate-urls). The
 * first version of this page named Booking.com, Hotels.com, TripAdvisor and
 * "direct hotel partnerships", none of which any code links to
 * (plan-stay-pass2 WP2 item 6). Keep this list in step with BRAND_CONFIGS.
 */
const HOTEL_PROGRAMMES: Array<{ brands: string; network: string }> = [
  { brands: "Marriott", network: "Partnerize" },
  { brands: "Hilton and Hyatt", network: "Awin" },
  { brands: "IHG, Choice, Wyndham and Best Western", network: "CJ (Commission Junction)" },
];

export default function AffiliateDisclosure() {

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
              <strong className="text-foreground">Last updated:</strong> September 2026
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
              <p>
                On hotel pages, a booking link for these brands can be an affiliate link. It goes
                through the brand&apos;s affiliate network and lands on the brand&apos;s own site:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                {HOTEL_PROGRAMMES.map((p) => (
                  <li key={p.network}>
                    <strong className="text-foreground">{p.brands}</strong>, through {p.network}
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                A hotel outside these brands gets a plain link to its own website, and we earn
                nothing from it. Some banner ads on the site are also affiliate links.
              </p>
            </section>

            <section id="featured" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                How We Choose Featured Hotels
              </h2>
              <p>
                &quot;Featured&quot; on a hotel is a flag our editors set by hand. It adds a Featured
                badge, and puts the hotel at the top of the list when the list is sorted by Featured. Every
                other sort (hotel class, typical rate, A-Z, newest, or distance to a venue) ignores
                the flag.
              </p>
              <p className="mt-3">
                Our editorial content is not influenced by affiliate relationships. We list hotels
                with and without affiliate links, and a link doesn&apos;t change how a hotel is
                described.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                Identifying Affiliate Links
              </h2>
              <p>
                A booking button names the site it opens, for example &quot;Book on hilton.com&quot;.
                When that button is an affiliate link it says so right next to it, and it is marked
                with <code>rel=&quot;sponsored&quot;</code> in the HTML. A link that reads &quot;Hotel
                website&quot; is not an affiliate link.
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
                <Link to="/contact" className="text-primary underline underline-offset-2">
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

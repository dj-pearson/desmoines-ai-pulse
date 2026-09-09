import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Advertising policies (WEB-ADS-014).
 *
 * Three surfaces told advertisers their creative would be reviewed against
 * "our advertising policies" and linked to /advertising-policies, which was
 * not a route - the policies were neither published nor written down. An
 * advertiser cannot comply with rules they cannot read, and a platform cannot
 * fairly enforce rules it never published.
 *
 * EVERY RULE BELOW IS ONE THE PLATFORM ACTUALLY APPLIES. They are read off
 * supabase/functions/campaign-creative-review/index.ts: MIN_DIMS for the
 * per-placement pixel floors, the https + resolves + no-private-host check on
 * the target URL, the family-friendly brand-safety filter, and the
 * good-standing check on the campaign. Nothing here is invented, and nothing
 * here promises a review this platform does not perform. If the checks change,
 * change this page in the same commit.
 */
export default function AdvertisingPolicies() {
  useDocumentTitle("Advertising Policies");

  return (
    <>
      <Helmet>
        <title>Advertising Policies | Des Moines Insider</title>
        <meta
          name="description"
          content="What we require of ad creatives on Des Moines Insider: image sizes per placement, destination URL rules, content standards, and how review works."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Advertising Policies</h1>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> September 9, 2026
            </p>

            <p>
              These are the rules every ad creative on Des Moines Insider has to meet.
              They are the checks our review actually runs, in the order it runs them,
              so you can tell before you upload whether a creative will clear. They sit
              alongside our{" "}
              <Link to="/terms" className="text-primary underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/acceptable-use" className="text-primary underline">
                Acceptable Use Policy
              </Link>
              , which apply to advertisers as they do to everyone else.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                1. Image size, by placement
              </h2>
              <p>
                A creative is rejected if it is smaller than the minimum for the
                placement it is booked into. Larger is fine; the image is scaled to fit.
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  <strong className="text-foreground">Top banner</strong> and{" "}
                  <strong className="text-foreground">below fold</strong>: at least
                  728 &times; 90 pixels
                </li>
                <li>
                  <strong className="text-foreground">Featured spot</strong> and{" "}
                  <strong className="text-foreground">sponsored listing</strong>: at
                  least 300 &times; 250 pixels
                </li>
                <li>
                  <strong className="text-foreground">Sidebar</strong>: at least
                  160 &times; 600 pixels
                </li>
              </ul>
              <p>
                The image also has to load. A file we cannot open, or a link to an
                image hosted somewhere we cannot reach, fails this check.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                2. Where the ad sends people
              </h2>
              <p>Your destination URL must:</p>
              <ul className="list-disc ml-6 space-y-2">
                <li>use <strong className="text-foreground">https</strong>, not http;</li>
                <li>
                  resolve to a working page when we check it, not a dead domain or a
                  server that times out;
                </li>
                <li>
                  be a public address. Links to localhost, private network ranges, or
                  internal hostnames are rejected;
                </li>
                <li>
                  not redirect to a non-https destination. We follow the redirect and
                  judge where it lands, not where it starts.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                3. Content standards
              </h2>
              <p>
                Des Moines Insider is a family-friendly local guide, and ad copy is
                screened against that standard. In practice that rules out adult
                content, gambling, weapons, illegal products or services, hateful or
                harassing language, and shock or scare tactics.
              </p>
              <p>
                Ads also have to be honest about who is advertising and what is on
                offer: no impersonating another business, no claiming an affiliation
                with Des Moines Insider that does not exist, and no offer in the
                creative that the destination page does not actually make.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                4. Account standing
              </h2>
              <p>
                Creatives are not reviewed for a campaign that is rejected, cancelled,
                or suspended. If your campaign is in one of those states, sort that out
                first - a new creative will not clear on its own.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                5. How review works
              </h2>
              <p>
                Creatives are checked automatically against sections 1, 2 and 4 above,
                and the copy is screened against section 3. Anything the automatic
                checks cannot clear goes to a person. Expect a decision within 1-2
                business days, and an email either way - approved, or with the reason
                so you can fix it and resubmit.
              </p>
              <p>
                A rejection tells you which check failed. It is not a judgement about
                your business, and resubmitting a corrected creative costs nothing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                6. Changes to these policies
              </h2>
              <p>
                We update this page when the checks change. If a change would affect a
                creative already running, we will contact you before it takes effect
                rather than pulling the ad.
              </p>
              <p>
                Questions about a specific creative or a rejection:{" "}
                <Link to="/contact" className="text-primary underline">
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

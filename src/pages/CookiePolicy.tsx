import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { reopenConsentBanner } from "@/components/CookieConsentBanner";

export default function CookiePolicy() {
  useDocumentTitle("Cookie Policy");

  return (
    <>
      <Helmet>
        <title>Cookie Policy | Des Moines Insider</title>
        <meta
          name="description"
          content="How Des Moines Insider uses cookies and similar technologies, what categories exist, and how to change your preferences."
        />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Cookie Policy</h1>

          <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
            <p className="text-base">
              <strong className="text-foreground">Last updated:</strong> April 13, 2026
            </p>

            <p>
              This Cookie Policy explains how Des Moines Insider (&quot;we,&quot;
              &quot;us,&quot; &quot;our&quot;) uses cookies and similar tracking
              technologies on our website and mobile web experiences. It supplements
              our{" "}
              <Link to="/privacy-policy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                1. What are cookies?
              </h2>
              <p>
                Cookies are small text files placed on your device by websites you
                visit. They are widely used to make websites work (or work more
                efficiently), to remember your preferences, and to provide reporting
                information to site owners. &quot;Similar technologies&quot; include
                local storage, session storage, web beacons, and SDKs inside our
                mobile apps.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                2. Categories of cookies we use
              </h2>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                Essential (always active)
              </h3>
              <p>
                Required for authentication, session management, security (CSRF
                tokens), load balancing, and fraud prevention. These cannot be
                disabled because the site cannot function without them. Examples:
                Supabase auth session cookies, Cloudflare load-balancer cookies.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                Preferences
              </h3>
              <p>
                Remember UI choices such as theme (light/dark), language, saved
                filters, and recently viewed venues. Stored locally on your device.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                Analytics
              </h3>
              <p>
                Help us understand which pages people use and which features matter.
                We use aggregated and anonymized measurement (e.g., page views,
                feature adoption). You can opt out at any time — no analytics
                cookies are set until you accept this category.
              </p>

              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                Advertising &amp; targeting
              </h3>
              <p>
                Partner cookies used by third parties (e.g., ad networks) to measure
                campaign performance and personalize advertising. If you decline
                this category, we do not enable third-party advertising trackers and
                we do not &quot;sell&quot; or &quot;share&quot; your personal
                information for cross-context behavioral advertising as those terms
                are defined under the CCPA/CPRA.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                3. Your choices
              </h2>
              <p>
                When you first visit the site, we show a banner that lets you accept
                all, reject non-essential, or customize each category. You can
                change your choice at any time:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>
                  Click the button below to reopen the consent banner and update
                  your categories.
                </li>
                <li>
                  Use your browser settings to block or delete cookies. Note:
                  blocking essential cookies may break features such as sign-in.
                </li>
                <li>
                  If your browser sends the Global Privacy Control (GPC) signal, we
                  treat it as a valid opt-out for advertising/targeting cookies
                  without any further action on your part, as required by Colorado
                  and California privacy regulations.
                </li>
              </ul>

              <div className="mt-4">
                <Button onClick={() => reopenConsentBanner()} variant="outline">
                  Update my cookie preferences
                </Button>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                4. Third parties
              </h2>
              <p>
                We rely on a small set of vetted service providers that may set their
                own cookies when you use our site. These include Supabase
                (authentication), Cloudflare (hosting and security), Stripe (payments
                on checkout pages), and, with your analytics consent, privacy-first
                measurement tools. Each of these providers operates under their own
                privacy policies; we only share the data necessary to provide the
                service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                5. How long we keep cookie data
              </h2>
              <p>
                Session cookies expire when you close your browser. Persistent
                cookies and our consent record expire after a maximum of 13 months,
                at which point we re-request your preferences.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                6. Changes to this policy
              </h2>
              <p>
                We may update this Cookie Policy as our practices or applicable law
                change. Material changes will be announced on the site and, where
                required, will prompt you to re-consent.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">
                7. Contact
              </h2>
              <p>
                Questions? Email{" "}
                <a
                  href="mailto:privacy@desmoinesinsider.com"
                  className="text-primary underline"
                >
                  privacy@desmoinesinsider.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

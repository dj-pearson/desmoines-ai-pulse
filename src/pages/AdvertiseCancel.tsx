import { Link, useSearchParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

export default function AdvertiseCancel() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");

  return (
    <BusinessLayout>
      <SEOHead
        title="Payment not completed"
        description="Your Des Moines Insider ad campaign wasn't paid for."
        robots="noindex, follow"
      />
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold sm:text-3xl text-foreground">Payment not completed</h1>
        <p className="mt-3 max-w-prose text-lg">
          {campaignId
            ? "Your campaign is saved. Checkout links expire after 30 minutes; you can pay from the campaign page any time."
            : "Nothing was charged. Your campaigns page shows every campaign you've saved, and you can pay for any of them from there."}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {campaignId ? (
            <Button asChild className="min-h-11">
              <Link to={`/campaigns/${campaignId}`}>Pay from the campaign page</Link>
            </Button>
          ) : (
            <Button asChild className="min-h-11">
              <Link to="/campaigns">Go to your campaigns</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/advertise">Start a different campaign</Link>
          </Button>
        </div>

        <section aria-labelledby="card-heading" className="mt-10 max-w-prose">
          <h2 id="card-heading" className="text-lg font-semibold">
            If your card was declined
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Stripe handles the card, so we don't see why it was refused. Your bank or card issuer can tell you, or try a
            different card from the campaign page. Still stuck? Email{" "}
            <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
              {BUSINESS_CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </BusinessLayout>
  );
}

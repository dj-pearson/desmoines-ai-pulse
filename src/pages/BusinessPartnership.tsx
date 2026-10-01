import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import FAQSchema from "@/components/schema/FAQSchema";
import SEOHead from "@/components/SEOHead";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { BusinessPartnershipApplication } from "@/components/BusinessPartnershipApplication";
import { PartnershipInquiryForm } from "@/components/business/PartnershipInquiryForm";
import { useAuth } from "@/hooks/useAuth";
import { useTabState } from "@/hooks/useTabState";
import { lowestDailyRate, useRateCard } from "@/hooks/useCampaigns";
import { OWNER_EDITABLE_FIELDS } from "@/hooks/useMyBusinessClaims";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { formatUSD } from "@/lib/campaignDisplay";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF, SUBMISSION_REVIEW_COPY } from "@/lib/businessCopy";

const TABS = ["overview", "apply"] as const;

const FIELD_WORDS: Record<string, string> = {
  description: "description",
  website: "website",
  phone: "phone number",
  image_url: "photo",
  menu_url: "menu link",
};

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** What an owner can edit, in words, from the same whitelist the form sends. */
const RESTAURANT_FIELDS = listWords(OWNER_EDITABLE_FIELDS.restaurant.map((f) => FIELD_WORDS[f]));
const ATTRACTION_FIELDS = listWords(OWNER_EDITABLE_FIELDS.attraction.map((f) => FIELD_WORDS[f]));

/**
 * The questions the page answers, rendered on the page and published as
 * FAQPage (through FAQSchema, rendered next to the list, so the block only
 * exists while the questions are on screen) from the same array, so the markup can't claim what the page
 * doesn't say. No prices in here: the server decides those (CLAUDE.md, "Money
 * is decided on the server").
 */
const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "How do I claim my listing?",
    answer:
      "Sign in, open your restaurant or attraction on the site and press \"Claim this listing\". If your email address is on the same domain as the listing's website, the claim is verified straight away. Otherwise a person on our team checks it.",
  },
  {
    question: "What can I change once my listing is verified?",
    answer: `For a restaurant: the ${RESTAURANT_FIELDS}. For an attraction: the ${ATTRACTION_FIELDS}. Changes go live without review. For anything else, like hours or the name, email us and we'll look at it.`,
  },
  {
    question: "How are ads priced?",
    answer:
      "Each placement has a daily rate on our rate card. Pick your dates at /advertise and the total shown there comes from our server; checkout charges that same total.",
  },
];

export default function BusinessPartnership() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useTabState("overview", { validTabs: TABS });
  const rateCard = useRateCard();
  // Nothing at all when the card can't be read: no fallback price.
  const fromRate = rateCard.data ? lowestDailyRate(rateCard.data) : null;

  return (
    <BusinessLayout>
      <SEOHead
        title="For Des Moines Businesses"
        description="Claim your Des Moines restaurant or attraction listing, correct its details, submit events and buy ad placements with impression and click reporting."
        canonicalUrl={getCanonicalUrl("/business-partnership")}
        url="/business-partnership"
        keywords={["Des Moines business listing", "claim listing", "advertise Des Moines", "submit event"]}
      />

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Breadcrumbs
          className="mb-6"
          items={[
            { label: "Home", href: "/" },
            { label: "For businesses" },
          ]}
        />

        <header className="mb-8 space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Your business on Des Moines Insider</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            Claim your listing, keep its details right, add your events and pay to promote them. Here's what
            you can do today, in the order most owners do it.
          </p>
          <div className="flex flex-wrap gap-3">
            {user ? (
              <Button asChild size="lg" className="min-h-11">
                <Link to="/business">Open your business workspace</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="min-h-11">
                  <Link to="/auth?mode=signup&redirect=/business">Create a free account</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-11">
                  <Link to="/auth?redirect=/business">Sign in</Link>
                </Button>
                <Button size="lg" variant="ghost" className="min-h-11" onClick={() => setActiveTab("apply")}>
                  Ask a question first
                </Button>
              </>
            )}
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="overview" className="min-h-11">
              How it works
            </TabsTrigger>
            <TabsTrigger value="apply" className="min-h-11">
              {user ? "Apply as a partner" : "Get in touch"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-8 space-y-12">
            <section aria-labelledby="steps-heading">
              <h2 id="steps-heading" className="mb-4 text-2xl font-semibold">
                What you can do
              </h2>
              <ol className="max-w-prose list-decimal space-y-5 pl-5 marker:font-semibold">
                <li>
                  <h3 className="font-semibold">Find and claim your listing</h3>
                  <p className="text-muted-foreground">
                    Open your restaurant or attraction on the site and press "Claim this listing". A matching
                    email domain verifies it straight away; otherwise a person checks it.{" "}
                    <Link to="/restaurants" className="font-medium text-primary underline-offset-4 hover:underline">
                      Restaurants
                    </Link>
                    {", "}
                    <Link to="/attractions" className="font-medium text-primary underline-offset-4 hover:underline">
                      attractions
                    </Link>
                    .
                  </p>
                </li>
                <li>
                  <h3 className="font-semibold">Correct its details yourself</h3>
                  <p className="text-muted-foreground">
                    Once verified, change the {RESTAURANT_FIELDS} from your{" "}
                    <Link to="/business" className="font-medium text-primary underline-offset-4 hover:underline">
                      business workspace
                    </Link>
                    . Changes go live without review.
                  </p>
                </li>
                <li>
                  <h3 className="font-semibold">Submit your events</h3>
                  <p className="text-muted-foreground">
                    {SUBMISSION_REVIEW_COPY}{" "}
                    <Link to="/submit-event" className="font-medium text-primary underline-offset-4 hover:underline">
                      Submit an event
                    </Link>
                    .
                  </p>
                </li>
                <li>
                  <h3 className="font-semibold">Buy a placement</h3>
                  <p className="text-muted-foreground">
                    Banners and sponsored listings, priced per day for the dates you pick, with impression and
                    click reporting for each one.{" "}
                    {fromRate !== null && <>From {formatUSD(fromRate)}/day. </>}
                    <Link to="/advertise" className="font-medium text-primary underline-offset-4 hover:underline">
                      See placements
                    </Link>
                    .
                  </p>
                </li>
              </ol>
            </section>

            <section aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="mb-4 text-2xl font-semibold">
                Questions owners ask
              </h2>
              <FAQSchema faqItems={[...FAQ]} />
              <dl className="max-w-prose space-y-6">
                {FAQ.map((item) => (
                  <div key={item.question}>
                    <dt className="font-semibold">{item.question}</dt>
                    <dd className="mt-1 text-muted-foreground">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </TabsContent>

          <TabsContent value="apply" className="mt-8 space-y-6">
            <h2 className="text-2xl font-semibold">Work with us</h2>
            {user ? (
              <BusinessPartnershipApplication />
            ) : (
              <div className="space-y-6">
                <p className="max-w-prose text-muted-foreground">
                  Tell us about your business and what you're after, and we'll reply by email. Or write to{" "}
                  <a href={BUSINESS_CONTACT_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
                    {BUSINESS_CONTACT_EMAIL}
                  </a>{" "}
                  directly.
                </p>
                <PartnershipInquiryForm />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </BusinessLayout>
  );
}
